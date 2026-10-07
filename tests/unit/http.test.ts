import { describe, expect, it, vi } from 'vitest';
import { ErrorMiddleware } from '../../src/shared/middlewares/ErrorMiddleware';
import { parseRequest } from '../../src/shared/middlewares/RequestParser';
import { BadRequestError, NotFoundError, ValidationError } from '../../src/domain/errors/AppError';
import { HttpCode } from '../../src/shared/http/httpCodes';
import type { ILogger } from '../../src/application/ports/ILogger';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const loggerMock: ILogger = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
};

const buildEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
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

describe('ErrorMiddleware', () => {
  const middleware = new ErrorMiddleware(loggerMock);

  it('traduce errores de dominio a su status code', () => {
    const result = middleware.handle(new NotFoundError('User'), 'req-1');
    expect(result.statusCode).toBe(HttpCode.NOT_FOUND);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
  });

  it('traduce ValidationError e incluye issues', () => {
    const result = middleware.handle(
      new ValidationError('Invalid user payload', [{ field: 'email', message: 'must match format email' }]),
      'req-1'
    );

    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(HttpCode.UNPROCESSABLE_ENTITY);
    expect(body.error.issues).toHaveLength(1);
  });

  it('no filtra internals en errores desconocidos', () => {
    const result = middleware.handle(new Error('connection string leaked'), 'req-1');

    expect(result.statusCode).toBe(HttpCode.INTERNAL_SERVER_ERROR);
    expect(result.body).not.toContain('connection string leaked');
    expect(JSON.parse(result.body).error.message).toBe('Internal server error');
  });

  it('mapea JSON malformado a 400', () => {
    const result = middleware.handle(Object.assign(new SyntaxError('bad'), { name: 'JsonParseError' }), 'req-1');
    expect(result.statusCode).toBe(HttpCode.BAD_REQUEST);
  });
});

describe('parseRequest', () => {
  it('parsea body JSON', () => {
    const ctx = parseRequest(buildEvent({ httpMethod: 'POST', body: '{"firstName":"Ana"}' }), 'req-1');
    expect(ctx.body).toEqual({ firstName: 'Ana' });
  });

  it('decodifica body base64', () => {
    const encoded = Buffer.from('{"firstName":"Ana"}', 'utf-8').toString('base64');
    const ctx = parseRequest(buildEvent({ body: encoded, isBase64Encoded: true }), 'req-1');
    expect(ctx.body).toEqual({ firstName: 'Ana' });
  });

  it('lanza 400 con JSON invalido', () => {
    expect(() => parseRequest(buildEvent({ body: '{invalid' }), 'req-1')).toThrow(BadRequestError);
  });

  it('lanza 400 si el content-type no es JSON', () => {
    expect(() =>
      parseRequest(buildEvent({ headers: { 'content-type': 'text/xml' }, body: '<x/>' }), 'req-1')
    ).toThrow(/application\/json/);
  });

  it('lanza 400 si el body excede el limite', () => {
    const huge = JSON.stringify({ data: 'a'.repeat(300 * 1024) });
    expect(() => parseRequest(buildEvent({ body: huge }), 'req-1')).toThrow(/maximum allowed size/);
  });

  it('normaliza method, params y query', () => {
    const ctx = parseRequest(
      buildEvent({
        httpMethod: 'get',
        resource: '/users/{id}',
        pathParameters: { id: 'abc' },
        queryStringParameters: { limit: '5' },
      }),
      'req-1'
    );

    expect(ctx.method).toBe('GET');
    expect(ctx.path).toBe('/users/{id}');
    expect(ctx.params).toEqual({ id: 'abc' });
    expect(ctx.query).toEqual({ limit: '5' });
  });

  it('deja body undefined cuando no hay payload', () => {
    expect(parseRequest(buildEvent(), 'req-1').body).toBeUndefined();
  });
});