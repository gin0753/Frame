import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { randomUUID } from 'node:crypto';
import { apiErrorSchema } from '@frame/contracts';
import { CatalogUnavailableException } from './catalog-unavailable.exception';
export function safeError(error: unknown) {
  const status = error instanceof HttpException ? error.getStatus() : 500;
  return { statusCode: status, message: STATUS_CODES[status] ?? 'Error' };
}
const errorCodes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const body = safeError(error);
    const requestId = `req_${randomUUID()}`;
    host
      .switchToHttp()
      .getResponse<Response>()
      .set('Cache-Control', 'no-store')
      .set('X-Request-Id', requestId)
      .status(body.statusCode)
      .json(
        apiErrorSchema.parse({
          error: {
            code:
              error instanceof CatalogUnavailableException
                ? 'CATALOG_UNAVAILABLE'
                : (errorCodes[body.statusCode] ?? 'HTTP_ERROR'),
            message: body.message,
            requestId,
          },
        }),
      );
  }
}
