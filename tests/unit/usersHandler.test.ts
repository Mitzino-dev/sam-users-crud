import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const serviceMock = {
  createUser: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
};

const loggerMock = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
};

vi.mock('../../src/infrastructure/container/Container', () => ({
  Container: {
    getInstance: () => ({
      getLogger: () => loggerMock,
      getUserService: () => serviceMock,
      getValidator: () => new AjvUserValidatorRef(),
    }),
  },
}));

import { AjvUserValidator } from '../../src/infrastructure/validators/AjvUserValidator';
import { UsersHandler } from '../../src/handlers/usersHandler';
import { HttpCode } from '../../src/shared/http/httpCodes';
import { NotFoundError, ValidationError } from '../../src/domain/errors/AppError';

const AjvUserValidatorRef = AjvUserValidator;
const UUID = '11111111-1111-4111-8111-111111111111';

const event = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    resource: '/users',
    path: '/users',
    headers: { 'content-type': 'application/json' },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: { requestId: 'req-1' },
    ...overrides,
  }) as unknown as APIGatewayProxyEvent;

describe('UsersHandler (routing + middleware)', () => {
  let handler: UsersHandler;

  beforeEach(() => {
    handler = UsersHandler.fromContainer({
      getLogger: () => loggerMock,
      getUserService: () => serviceMock,
      getValidator: () => new AjvUserValidator(),
    } as never);
  });

  it('GET /users devuelve la lista paginada', async () => {
    serviceMock.listUsers.mockResolvedValue({
      items: [{ id: UUID, firstName: 'Ana' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await handler.handle(event());

    expect(result.statusCode).toBe(HttpCode.OK);
    const body = JSON.parse(result.body);
    expect(body.data.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(serviceMock.listUsers).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });
  });

  it('POST /users responde 201 con Location-friendly envelope', async () => {
    serviceMock.createUser.mockResolvedValue({ id: UUID, firstName: 'Ana' });

    const result = await handler.handle(
      event({ httpMethod: 'POST', body: JSON.stringify({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com' }) })
    );

    expect(result.statusCode).toBe(HttpCode.CREATED);
    expect(JSON.parse(result.body).data.user.id).toBe(UUID);
  });

  it('POST /users sin body responde 422', async () => {
    const result = await handler.handle(event({ httpMethod: 'POST' }));

    expect(result.statusCode).toBe(HttpCode.UNPROCESSABLE_ENTITY);
    expect(serviceMock.createUser).not.toHaveBeenCalled();
  });

  it('GET /users/{id} propaga el id', async () => {
    serviceMock.getUserById.mockResolvedValue({ id: UUID });

    const result = await handler.handle(
      event({ resource: '/users/{id}', pathParameters: { id: UUID } })
    );

    expect(serviceMock.getUserById).toHaveBeenCalledWith(UUID);
    expect(result.statusCode).toBe(HttpCode.OK);
  });

  it('PUT /users/{id} responde 200', async () => {
    serviceMock.updateUser.mockResolvedValue({ id: UUID, age: 29 });

    const result = await handler.handle(
      event({
        httpMethod: 'PUT',
        resource: '/users/{id}',
        pathParameters: { id: UUID },
        body: JSON.stringify({ age: 29 }),
      })
    );

    expect(result.statusCode).toBe(HttpCode.OK);
    expect(serviceMock.updateUser).toHaveBeenCalledWith(UUID, { age: 29 });
  });

  it('DELETE /users/{id} responde 204 sin body', async () => {
    serviceMock.deleteUser.mockResolvedValue(undefined);

    const result = await handler.handle(
      event({ httpMethod: 'DELETE', resource: '/users/{id}', pathParameters: { id: UUID } })
    );

    expect(result.statusCode).toBe(HttpCode.NO_CONTENT);
    expect(result.body).toBe('');
  });

  it('ruta desconocida responde 422 con envelope de error', async () => {
    const result = await handler.handle(event({ httpMethod: 'PATCH' }));

    expect(result.statusCode).toBe(HttpCode.UNPROCESSABLE_ENTITY);
    expect(JSON.parse(result.body).success).toBe(false);
  });

  it('OPTIONS responde 204 (preflight CORS)', async () => {
    const result = await handler.handle(event({ httpMethod: 'OPTIONS' }));

    expect(result.statusCode).toBe(HttpCode.NO_CONTENT);
    expect(result.headers['Access-Control-Allow-Methods']).toContain('PUT');
  });

  it('convierte NotFoundError del servicio en 404', async () => {
    serviceMock.getUserById.mockRejectedValue(new NotFoundError('User'));

    const result = await handler.handle(event({ resource: '/users/{id}', pathParameters: { id: UUID } }));

    expect(result.statusCode).toBe(HttpCode.NOT_FOUND);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
  });

  it('nunca expone el stack trace en errores inesperados', async () => {
    serviceMock.createUser.mockRejectedValue(new Error('postgres://user:pass@host failed'));

    const result = await handler.handle(
      event({ httpMethod: 'POST', body: JSON.stringify({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com' }) })
    );

    expect(result.statusCode).toBe(HttpCode.INTERNAL_SERVER_ERROR);
    expect(result.body).not.toContain('postgres://');
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('rechaza query params invalidos antes de llamar al servicio', async () => {
    const result = await handler.handle(event({ queryStringParameters: { limit: '9999' } }));

    expect(result.statusCode).toBe(HttpCode.UNPROCESSABLE_ENTITY);
    expect(serviceMock.listUsers).not.toHaveBeenCalled();
  });

  it('rechaza body con JSON malformado', async () => {
    const result = await handler.handle(event({ httpMethod: 'POST', body: '{oops' }));

    expect(result.statusCode).toBe(HttpCode.BAD_REQUEST);
  });

  it('propaga ValidationError con issues de AJV', async () => {
    serviceMock.createUser.mockRejectedValue(
      new ValidationError('Invalid user payload', [{ field: 'email', message: 'must match format email' }])
    );

    const result = await handler.handle(
      event({ httpMethod: 'POST', body: JSON.stringify({ firstName: 'Ana', lastName: 'Lopez' }) })
    );

    expect(result.statusCode).toBe(HttpCode.UNPROCESSABLE_ENTITY);
    expect(JSON.parse(result.body).error.issues[0].field).toBe('email');
  });
});