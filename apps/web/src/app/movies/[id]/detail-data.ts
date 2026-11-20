import 'server-only';
import { cache } from 'react';
import { movieParamsSchema } from '@frame/contracts';
import { CatalogReadError, getMovieDetail } from '@/lib/server/catalog';

export const readDetail = cache(async (id: string) => {
  const parsed = movieParamsSchema.safeParse({ tmdbMovieId: id });
  if (!parsed.success) return { status: 'missing' as const };
  try {
    const movie = await getMovieDetail(parsed.data);
    return { status: 'success' as const, movie };
  } catch (error) {
    if (error instanceof CatalogReadError && error.status === 404)
      return { status: 'missing' as const };
    return {
      status:
        error instanceof CatalogReadError && error.status === 429
          ? ('busy' as const)
          : ('unavailable' as const),
    };
  }
});
