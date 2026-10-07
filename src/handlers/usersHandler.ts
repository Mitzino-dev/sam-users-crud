import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Container } from '../infrastructure/container/Container';
import type { IUserService } from '../application/services/UserService';
import type { AjvUserValidator } from '../infrastructure/validators/AjvUserValidator';
import { ValidationError } from '../domain/errors/AppError';
import { ErrorMiddleware } from '../shared/middlewares/ErrorMiddleware';
import { parseRequest, type RequestContext } from '../shared/middlewares/RequestParser';
import { ResponseBuilder, type ApiResult } from '../shared/http/responseBuilder';
import { generateRequestId } from '../shared/utils/uuid';
import { Database } from '../infrastructure/db/Database';
import type { ListUsersQuery } from '../types';
import type { ILogger } from '../application/ports/ILogger';

type RouteHandler = (ctx: RequestContext) => Promise<ApiResult>;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Handler (fachada) que enruta por metodo HTTP y recurso.
 * Solo orquesta: delega la logica de negocio a UserService y traduce
 * errores via ErrorMiddleware. No hay reglas de negocio aqui.
 */
export class UsersHandler {
  private readonly routes: Record<string, RouteHandler>;

  constructor(
    private readonly userService: IUserService,
    private readonly validator: AjvUserValidator,
    private readonly logger: ILogger,
    private readonly errorMiddleware: ErrorMiddleware
  ) {
    this.routes = {
      'GET /users': (ctx) => this.listUsers(ctx),
      'POST /users': (ctx) => this.createUser(ctx),
      'GET /users/{id}': (ctx) => this.getUserById(ctx),
      'PUT /users/{id}': (ctx) => this.updateUser(ctx),
      'DELETE /users/{id}': (ctx) => this.deleteUser(ctx),
      'GET /health': () => this.healthCheck(),
    };
  }

  public static fromContainer(container: Container): UsersHandler {
    const logger = container.getLogger();
    return new UsersHandler(
      container.getUserService(),
      container.getValidator(),
      logger,
      new ErrorMiddleware(logger)
    );
  }

  public async handle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const requestId = event.requestContext?.requestId ?? generateRequestId();
    const startedAt = Date.now();

    this.logger.info('Incoming request', { requestId, method: event.httpMethod, path: event.resource });

    if ((event.httpMethod ?? '').toUpperCase() === 'OPTIONS') {
      return ResponseBuilder.noContent(requestId) as APIGatewayProxyResult;
    }

    try {
      const context = parseRequest(event, requestId);
      const route = this.routes[`${context.method} ${UsersHandler.resolvePath(context.path)}`];

      if (!route) {
        throw new ValidationError(`Route ${context.method} ${context.path} not found`);
      }

      const result = await route(context);

      this.logger.info('Request completed', {
        requestId,
        statusCode: result.statusCode,
        durationMs: Date.now() - startedAt,
      });

      return result as APIGatewayProxyResult;
    } catch (error) {
      return this.errorMiddleware.handle(error, requestId) as APIGatewayProxyResult;
    }
  }

  private static resolvePath(path: string): string {
    const normalized = path.replace(/\/+$/, '');
    return normalized.length > 0 ? normalized : '/users';
  }

  private async createUser(ctx: RequestContext): Promise<ApiResult> {
    if (ctx.body === undefined) {
      throw new ValidationError('Request body is required');
    }

    const user = await this.userService.createUser(ctx.body);
    return ResponseBuilder.created({ user }, ctx.requestId);
  }

  private async getUserById(ctx: RequestContext): Promise<ApiResult> {
    const user = await this.userService.getUserById(UsersHandler.extractId(ctx));
    return ResponseBuilder.ok({ user }, ctx.requestId);
  }

  private async listUsers(ctx: RequestContext): Promise<ApiResult> {
    const rawQuery = {
      page: ctx.query.page === undefined ? DEFAULT_PAGE : Number(ctx.query.page),
      limit: ctx.query.limit === undefined ? DEFAULT_LIMIT : Number(ctx.query.limit),
      sortBy: ctx.query.sortBy ?? 'createdAt',
      sortOrder: ctx.query.sortOrder ?? 'DESC',
      ...(ctx.query.search !== undefined ? { search: ctx.query.search } : {}),
    };

    const validation = this.validator.validateListQuery(rawQuery);
    if (!validation.isValid) {
      throw new ValidationError('Invalid query parameters', validation.issues);
    }

    const result = await this.userService.listUsers(validation.value as unknown as ListUsersQuery);

    return ResponseBuilder.ok(
      {
        users: result.items,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      },
      ctx.requestId
    );
  }

  private async updateUser(ctx: RequestContext): Promise<ApiResult> {
    if (ctx.body === undefined) {
      throw new ValidationError('Request body is required');
    }

    const user = await this.userService.updateUser(UsersHandler.extractId(ctx), ctx.body);
    return ResponseBuilder.ok({ user }, ctx.requestId);
  }

  private async deleteUser(ctx: RequestContext): Promise<ApiResult> {
    await this.userService.deleteUser(UsersHandler.extractId(ctx));
    return ResponseBuilder.noContent(ctx.requestId);
  }

  private async healthCheck(): Promise<ApiResult> {
    const healthy = await Database.healthCheck(this.logger);
    return ResponseBuilder.ok({ status: healthy ? 'ok' : 'degraded', database: healthy }, 'health');
  }

  private static extractId(ctx: RequestContext): string {
    const id = ctx.params.id;
    if (!id) {
      throw new ValidationError('Missing path parameter: id');
    }
    return id;
  }
}

/** Entry point consumida por AWS Lambda (ver template.yaml -> Handler). */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const usersHandler = UsersHandler.fromContainer(Container.getInstance());

  try {
    return await usersHandler.handle(event);
  } finally {
    // En local (sam local invoke) se cierra el pool para que el proceso termine.
    if (process.env.IS_LOCAL === 'true') {
      await Database.close();
    }
  }
};