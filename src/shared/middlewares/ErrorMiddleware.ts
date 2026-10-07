import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ILogger } from '../../application/ports/ILogger';
import { AppError, InternalServerError } from '../../domain/errors/AppError';
import { HttpCode } from '../../shared/http/httpCodes';
import { ResponseBuilder, type ApiResult } from '../../shared/http/responseBuilder';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Middleware de traduccion de errores a respuestas HTTP ( patron Chain of Responsibility).
 * - Nunca filtra stack traces ni mensajes internos al cliente.
 * - Loguea el error real con correlation id.
 */
export class ErrorMiddleware {
  constructor(private readonly logger: ILogger) {}

  public handle(error: unknown, requestId: string): ApiResult<never> {
    const normalized = ErrorMiddleware.normalize(error);
    const context = {
      requestId,
      statusCode: normalized.statusCode,
      code: normalized.code,
      ...(normalized.statusCode >= 500 ? { stack: (error as Error)?.stack } : {}),
    };

    if (normalized.statusCode >= 500) {
      this.logger.error(normalized.message, context);
    } else {
      this.logger.warn(normalized.message, context);
    }

    const issues = Array.isArray(normalized.details)
      ? (normalized.details as Array<{ field: string; message: string }>)
      : undefined;

    return ResponseBuilder.error(
      normalized.statusCode,
      normalized.code,
      normalized.message,
      requestId,
      issues
    ) as ApiResult<never>;
  }

  public async handleAsync<T>(requestId: string, work: () => Promise<T>): Promise<ApiResult<T>> {
    try {
      const result = await work();
      return result as unknown as ApiResult<T>;
    } catch (error) {
      return this.handle(error, requestId);
    }
  }

  private static normalize(error: unknown): NormalizedError {
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    const asError = error as { name?: string; message?: string; statusCode?: number };

    if (asError?.name === 'EntityTooLargeError') {
      return {
        statusCode: HttpCode.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large'
      };
    }
    if (asError?.name === 'JsonParseError' || asError?.name === 'SyntaxError') {
      return {
        statusCode: HttpCode.BAD_REQUEST,
        code: 'MALFORMED_JSON',
        message: 'Request body is not valid JSON'
      };
    }

    return {
      statusCode: HttpCode.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: new InternalServerError().message,
    };
  }
}

export type ApiHandler = (
  event: APIGatewayProxyEvent,
  requestId: string
) => Promise<APIGatewayProxyResult>;