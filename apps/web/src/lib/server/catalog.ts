import 'server-only';
import {
  catalogContracts,
  movieParamsSchema,
  popularQuerySchema,
  trendingQuerySchema,
} from '@frame/contracts';
import type {
  MovieParams,
  PopularQuery,
  TrendingQuery,
} from '@frame/contracts';
import { apiOrigin } from '../../../config/api-origin';

// Fixed public reads only; no cookies or caller-controlled origin.
async function readCatalog<T>(
  path: string,
  schema: { parse(value: unknown): T },
): Promise<T> {
  const origin = apiOrigin(process.env.FRAME_API_ORIGIN);
  if (!origin)
    throw new Error('FRAME_API_ORIGIN is required for server API requests.');
  try {
    const response = await fetch(`${origin}${path}`, {
      cache: 'no-store',
      redirect: 'error',
      // CatalogService bounds concurrent provider work to 2200 ms, leaving
      // 800 ms of this existing outer deadline for routing and delivery.
      signal: AbortSignal.timeout(3000),
    });
    if (
      !response.ok ||
      response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      throw new Error();
    return schema.parse(await response.json());
  } catch {
    throw new Error('FRAME catalog unavailable or invalid response.');
  }
}
export function getTrendingMovies(query: Partial<TrendingQuery> = {}) {
  const parsed = trendingQuerySchema.parse(query);
  return readCatalog(
    `${catalogContracts.trending.path}?${new URLSearchParams(parsed)}`,
    catalogContracts.trending.response,
  );
}
export function getPopularMovies(query: Partial<PopularQuery> = {}) {
  const parsed = popularQuerySchema.parse(query);
  return readCatalog(
    `${catalogContracts.popular.path}?${new URLSearchParams(parsed)}`,
    catalogContracts.popular.response,
  );
}
export function getCatalogGenres() {
  return readCatalog(
    catalogContracts.genres.path,
    catalogContracts.genres.response,
  );
}
export function getMovieDetail(params: MovieParams) {
  const parsed = movieParamsSchema.parse(params);
  return readCatalog(
    catalogContracts.detail.path.replace('{tmdbMovieId}', parsed.tmdbMovieId),
    catalogContracts.detail.response,
  );
}
