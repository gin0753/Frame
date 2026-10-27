import { z } from 'zod';

export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.literal('frame-api'),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.strictObject({
  status: z.literal('ready'),
  service: z.literal('frame-api'),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

// Current serialized codes, including generic HTTP_ERROR for database readiness 503.
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      'VALIDATION_ERROR',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'HTTP_ERROR',
    ]),
    message: z.string().min(1),
    requestId: z
      .string()
      .regex(
        /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// Route metadata is transport-only. Real HTTP tests bind these declarations to Nest.
export const healthContract = {
  method: 'get',
  path: '/api/v1/health',
  operationId: 'getHealth',
  response: healthResponseSchema,
} as const;
export const readinessContract = {
  method: 'get',
  path: '/api/v1/ready',
  operationId: 'getReadiness',
  response: readinessResponseSchema,
} as const;
