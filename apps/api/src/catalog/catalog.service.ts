import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { genresResponseSchema } from '@frame/contracts';
import { ZodError } from 'zod';
import { TmdbAdapter } from './tmdb/tmdb.adapter';
import { TmdbError } from './tmdb/tmdb.error';
import type { TmdbImageConfig } from './tmdb/tmdb.schemas';
import { CatalogUnavailableException } from '../common/catalog-unavailable.exception';
import {
  normalizeGenre,
  normalizeMovieDetail,
  normalizeMoviePage,
} from './catalog.normalizer';

// Outer web consumer and local proxy remain at 3000 ms. Reserve 800 ms for
// routing, normalization and response delivery; the adapter's standalone 3000 ms
// child guard is capped by this shared signal, never added to this budget.
export const CATALOG_DEADLINE_MS = 2200;

@Injectable()
export class CatalogService {
  constructor(@Inject(TmdbAdapter) private readonly tmdb: TmdbAdapter) {}
  private async read<T>(
    work: (signal: AbortSignal, cancel: () => void) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(
        new DOMException('Catalog deadline exceeded', 'TimeoutError'),
      );
    }, CATALOG_DEADLINE_MS);
    const signal = AbortSignal.any([
      controller.signal,
      ...(callerSignal ? [callerSignal] : []),
    ]);
    try {
      signal.throwIfAborted();
      return await work(signal, cancel);
    } catch (error) {
      if (timedOut || callerSignal?.aborted)
        throw new CatalogUnavailableException(503);
      if (error instanceof ZodError) throw new CatalogUnavailableException(502);
      if (!(error instanceof TmdbError)) throw error;
      const status =
        error.category === 'INVALID_REQUEST'
          ? 400
          : error.category === 'RATE_LIMITED'
            ? 429
            : [
                  'CONFIGURATION',
                  'AUTHENTICATION',
                  'TIMEOUT',
                  'CANCELLED',
                ].includes(error.category)
              ? 503
              : 502;
      if (status === 502 || status === 503)
        throw new CatalogUnavailableException(status);
      throw new HttpException('Catalog unavailable', status);
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
  private movieRead<T, R>(
    loadMovie: (signal: AbortSignal) => Promise<T>,
    normalize: (movie: T, config: TmdbImageConfig) => R,
    callerSignal?: AbortSignal,
  ) {
    return this.read(async (signal, cancel) => {
      // Both operations are independent. Schedule both before awaiting either;
      // retain their promises so failed/aborted siblings are cancelled and drained.
      const requests = [
        Promise.resolve().then(() => loadMovie(signal)),
        Promise.resolve().then(() => this.tmdb.imageConfiguration({ signal })),
      ] as const;
      try {
        const [movie, config] = await Promise.all(requests);
        signal.throwIfAborted();
        return normalize(movie, config);
      } finally {
        cancel();
        await Promise.allSettled(requests);
      }
    }, callerSignal);
  }
  trending(timeWindow: 'day' | 'week', signal?: AbortSignal) {
    return this.movieRead(
      (signal) => this.tmdb.trending(timeWindow, { signal }),
      (movie, config) => normalizeMoviePage(movie, config, 1, true),
      signal,
    );
  }
  popular(page: number, signal?: AbortSignal) {
    return this.movieRead(
      (signal) => this.tmdb.popular({ page, signal }),
      (movie, config) => normalizeMoviePage(movie, config, page),
      signal,
    );
  }
  genres(signal?: AbortSignal) {
    return this.read(
      async (signal) =>
        genresResponseSchema.parse({
          items: (await this.tmdb.genres({ signal })).genres.map(
            normalizeGenre,
          ),
        }),
      signal,
    );
  }
  detail(id: number, signal?: AbortSignal) {
    return this.movieRead(
      async (signal) => {
        try {
          return await this.tmdb.details(id, { signal });
        } catch (error) {
          // Only a movie-operation 404 establishes that the movie is absent.
          if (error instanceof TmdbError && error.category === 'NOT_FOUND')
            throw new NotFoundException();
          throw error;
        }
      },
      normalizeMovieDetail,
      signal,
    );
  }
}
