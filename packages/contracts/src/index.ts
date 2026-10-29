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
      'CATALOG_UNAVAILABLE',
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

const identity = z.number().int().positive().max(2147483647);
const text = z.string().trim().min(1);
const url = z.url({ protocol: /^https$/ });
export const genreSchema = z.strictObject({ id: identity, name: text });
export type Genre = z.infer<typeof genreSchema>;
export const movieSummarySchema = z.strictObject({
  id: identity,
  source: z.literal('tmdb'),
  title: text,
  releaseDate: z.iso.date().nullable(),
  posterUrl: url.nullable(),
  backdropUrl: url.nullable(),
  genreIds: z.array(identity),
  voteAverage: z.number().min(0).max(10).nullable(),
  voteCount: z.number().int().nonnegative(),
  overview: text.nullable(),
  externalUrl: url,
  attribution: z.strictObject({ provider: z.literal('tmdb'), sourceUrl: url }),
});
export type MovieSummary = z.infer<typeof movieSummarySchema>;
const person = z.strictObject({ id: identity, name: text });
export const movieDetailSchema = movieSummarySchema.extend({
  runtimeMinutes: z.number().int().positive().nullable(),
  directors: z.array(person),
  cast: z.array(person.extend({ character: text.nullable() })),
  countries: z.array(
    z.strictObject({ code: z.string().regex(/^[A-Z]{2}$/), name: text }),
  ),
  languages: z.array(
    z.strictObject({
      code: z.string().regex(/^[a-z]{2}$/),
      name: text.nullable(),
    }),
  ),
  budgetUsd: z.number().int().positive().nullable(),
  revenueUsd: z.number().int().positive().nullable(),
  trailerUrl: url.nullable(),
  externalLinks: z.array(z.strictObject({ label: text, url })),
});
export type MovieDetail = z.infer<typeof movieDetailSchema>;
export const moviePageSchema = z
  .strictObject({
    items: z.array(movieSummarySchema).max(20),
    page: z.number().int().positive().max(500),
    pageSize: z.literal(20),
    totalPages: z.number().int().min(0),
    totalResults: z.number().int().min(0),
  })
  .refine(
    (page) =>
      page.totalResults === 0
        ? page.totalPages === 0 && page.items.length === 0
        : page.totalPages > 0 && page.items.length <= page.totalResults,
    'Zero results require zero pages and no items; positive results require positive pages, and items cannot exceed the result total.',
  )
  .describe(
    'Provider totals do not imply page accessibility. Runtime cross-field validation additionally requires zero results to have zero pages/no items, positive results to have positive pages, and items not to exceed totalResults. These cross-field rules are not encoded by the OpenAPI generator.',
  );
export type MoviePage = z.infer<typeof moviePageSchema>;
export const genresResponseSchema = z.strictObject({
  items: z.array(genreSchema),
});
export type GenresResponse = z.infer<typeof genresResponseSchema>;
// HTTP strings stay strings in OpenAPI; pipes return the same validated representation.
export const trendingQuerySchema = z.strictObject({
  timeWindow: z.enum(['day', 'week']).default('week'),
  page: z.literal('1').default('1'),
});
export const popularQuerySchema = z.strictObject({
  page: z
    .string()
    .regex(/^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/)
    .default('1'),
});
// Decimal partitions of 1..2147483647, with no leading zeros. The same pattern
// is emitted into OpenAPI; there is no runtime-only numeric upper-bound refine.
const movieIdPattern =
  /^(?:[1-9][0-9]{0,8}|1[0-9]{9}|20[0-9]{8}|21[0-3][0-9]{7}|214[0-6][0-9]{6}|2147[0-3][0-9]{5}|21474[0-7][0-9]{4}|214748[0-2][0-9]{3}|2147483[0-5][0-9]{2}|21474836[0-3][0-9]|214748364[0-7])$/;
export const movieParamsSchema = z.strictObject({
  tmdbMovieId: z
    .string()
    .regex(movieIdPattern)
    .describe('Positive TMDB int32 movie ID (1–2147483647).'),
});
export const emptyQuerySchema = z.strictObject({});
export type TrendingQuery = z.infer<typeof trendingQuerySchema>;
export type PopularQuery = z.infer<typeof popularQuerySchema>;
export type MovieParams = z.infer<typeof movieParamsSchema>;
export const catalogContracts = {
  trending: {
    method: 'get',
    path: '/api/v1/movies/trending',
    operationId: 'getTrendingMovies',
    query: trendingQuerySchema,
    response: moviePageSchema,
  },
  popular: {
    method: 'get',
    path: '/api/v1/movies/popular',
    operationId: 'getPopularMovies',
    query: popularQuerySchema,
    response: moviePageSchema,
  },
  genres: {
    method: 'get',
    path: '/api/v1/genres',
    operationId: 'getGenres',
    query: emptyQuerySchema,
    response: genresResponseSchema,
  },
  detail: {
    method: 'get',
    path: '/api/v1/movies/{tmdbMovieId}',
    operationId: 'getMovieDetail',
    params: movieParamsSchema,
    query: emptyQuerySchema,
    response: movieDetailSchema,
  },
} as const;
