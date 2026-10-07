import { APIGatewayProxyEvent } from 'aws-lambda';
import { BadRequestError } from '../../domain/errors/AppError';

export const MAX_BODY_BYTES = 256 * 1024;

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  contentType?: string;
}

const decodeBody = (event: APIGatewayProxyEvent): string => {
  const raw = event.body ?? '';
  return event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf-8') : raw;
};

/**
 * Componente transversal: normaliza el evento de API Gateway v1 a un objeto
 * interno estable. Asigna el requestId desde headers/sistema y parsea el body.
 */
export function parseRequest(event: APIGatewayProxyEvent, requestId: string): RequestContext {
  const rawBody = decodeBody(event);

  if (Buffer.byteLength(rawBody, 'utf-8') > MAX_BODY_BYTES) {
    throw new BadRequestError('Request body exceeds the maximum allowed size');
  }

  const contentType = event.headers?.['content-type'] ?? event.headers?.['Content-Type'];

  let body: unknown = undefined;
  if (rawBody.trim().length > 0) {
    if (contentType && !contentType.includes('application/json')) {
      throw new BadRequestError('Content-Type must be application/json');
    }
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new BadRequestError('Request body is not valid JSON');
    }
  }

  return {
    requestId,
    method: (event.httpMethod ?? '').toUpperCase(),
    path: event.resource ?? event.path ?? '',
    params: (event.pathParameters as Record<string, string>) ?? {},
    query: (event.queryStringParameters as Record<string, string>) ?? {},
    body,
    contentType,
  };
}