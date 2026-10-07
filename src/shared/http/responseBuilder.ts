import { HttpCode } from './httpCodes';

export interface FieldIssue {
  field: string;
  message: string;
}

interface ErrorPayload {
  code: string;
  message: string;
  issues?: FieldIssue[];
}

export interface SuccessBody<T> {
  success: true;
  statusCode: number;
  data: T;
  requestId?: string;
  timestamp: string;
}

export interface ErrorBody {
  success: false;
  statusCode: number;
  error: ErrorPayload;
  requestId?: string;
  timestamp: string;
}

export interface ApiResult<T = unknown> {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  /** Phantom type: enlaza el envelope con el tipo de dato transportado. */
  __data?: T;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,X-Request-Id',
  'Access-Control-Max-Age': '86400',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

export class ResponseBuilder {
  private static headers(requestId?: string): Record<string, string> {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
    };
  }

  static ok<T>(data: T, requestId?: string): ApiResult<T> {
    return ResponseBuilder.json<T>(
      HttpCode.OK,
      { success: true, statusCode: HttpCode.OK, data, requestId, timestamp: new Date().toISOString() },
      requestId
    );
  }

  static created<T>(data: T, requestId?: string): ApiResult<T> {
    return ResponseBuilder.json<T>(
      HttpCode.CREATED,
      {
        success: true,
        statusCode: HttpCode.CREATED,
        data,
        requestId,
        timestamp: new Date().toISOString(),
      },
      requestId
    );
  }

  static noContent(requestId?: string): ApiResult<null> {
    return {
      statusCode: HttpCode.NO_CONTENT,
      headers: { ...ResponseBuilder.headers(requestId) },
      body: '',
    };
  }

  static error(
    statusCode: number,
    code: string,
    message: string,
    requestId?: string,
    issues?: FieldIssue[]
  ): ApiResult<null> {
    return ResponseBuilder.json<null>(
      statusCode,
      {
        success: false,
        statusCode,
        error: { code, message, ...(issues && issues.length > 0 ? { issues } : {}) },
        requestId,
        timestamp: new Date().toISOString(),
      },
      requestId
    );
  }

  private static json<T>(statusCode: number, body: SuccessBody<T> | ErrorBody, requestId?: string): ApiResult<T> {
    return {
      statusCode,
      headers: ResponseBuilder.headers(requestId),
      body: JSON.stringify(body),
    };
  }
}