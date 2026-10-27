import {
  healthResponseSchema,
  readinessResponseSchema,
  apiErrorSchema,
} from '@frame/contracts';
import type {
  HealthResponse,
  ReadinessResponse,
  ApiError,
} from '@frame/contracts';
import type { z } from 'zod';

const health: HealthResponse = healthResponseSchema.parse({
  status: 'ok',
  service: 'frame-api',
});
const readiness: ReadinessResponse = readinessResponseSchema.parse({
  status: 'ready',
  service: 'frame-api',
});
const error: ApiError = apiErrorSchema.parse({
  error: {
    code: 'HTTP_ERROR',
    message: 'Service Unavailable',
    requestId: 'req_12345678-1234-4123-8123-123456789abc',
  },
});
const input: z.input<typeof healthResponseSchema> = health;
const output: z.output<typeof healthResponseSchema> = health;
// @ts-expect-error Health status is a literal, not an unchecked string.
const invalid: HealthResponse = { status: 'anything', service: 'frame-api' };
const internal: HealthResponse = {
  status: 'ok',
  service: 'frame-api',
  // @ts-expect-error Internal database fields are not part of HTTP contracts.
  passwordHash: 'private',
};
void [health, readiness, error, input, output, invalid, internal];
