import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  genresResponseSchema,
  moviePageSchema,
  movieDetailSchema,
} from '@frame/contracts';
import { ZodError } from 'zod';
import { TmdbAdapter } from './tmdb/tmdb.adapter';
import { TmdbError } from './tmdb/tmdb.error';
import type { TmdbImageConfig } from './tmdb/tmdb.schemas';
import { tmdbImageConfigSchema } from './tmdb/tmdb.schemas';
import {
  CatalogCoordinator,
  CatalogCoordinationError,
} from './catalog.coordinator';
import { CATALOG_DEADLINE_MS, catalogKey } from './catalog.policy';
export { CATALOG_DEADLINE_MS } from './catalog.policy';
import { CatalogUnavailableException } from '../common/catalog-unavailable.exception';
import {
  normalizeGenre,
  normalizeMovieDetail,
  normalizeMoviePage,
} from './catalog.normalizer';

// Outer web consumer and local proxy remain at 3000 ms. Reserve 800 ms for
// routing, normalization and response delivery; the adapter's standalone 3000 ms
// child guard is capped by this shared signal, never added to this budget.

@Injectable()
export class CatalogService {
  #metrics = { requests: 0, totalDurationMs: 0, failed: 0 };
  constructor(
    @Inject(TmdbAdapter) private readonly tmdb: TmdbAdapter,
    @Inject(CatalogCoordinator)
    private readonly coordinator: CatalogCoordinator,
  ) {}
  diagnostics() {
    return {
      ...this.#metrics,
      coordinator: this.coordinator.diagnostics(),
      provider: this.tmdb.diagnostics(),
    };
  }
  private async read<T>(
    work: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const started = performance.now();
    this.#metrics.requests++;
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
      const result = await work(signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      this.#metrics.failed++;
      if (timedOut || callerSignal?.aborted)
        throw new CatalogUnavailableException(503);
      if (error instanceof ZodError) throw new CatalogUnavailableException(502);
      if (error instanceof CatalogCoordinationError)
        throw new CatalogUnavailableException(503);
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
      this.#metrics.totalDurationMs += performance.now() - started;
    }
  }
  private movieRead<T, R>(
    loadMovie: (signal: AbortSignal) => Promise<T>,
    normalize: (movie: T, config: TmdbImageConfig) => R,
    sharedSignal: AbortSignal,
  ) {
    const controller = new AbortController();
    const cancel = () =>
      controller.abort(sharedSignal.aborted ? sharedSignal.reason : undefined);
    const signal = AbortSignal.any([sharedSignal, controller.signal]);
    return (async () => {
      // Both operations are independent. Schedule both before awaiting either;
      // retain their promises so failed/aborted siblings are cancelled and drained.
      const requests = [
        Promise.resolve().then(() => loadMovie(signal)),
        Promise.resolve().then(() =>
          this.coordinator.get(
            catalogKey('configuration'),
            'configuration',
            tmdbImageConfigSchema,
            (signal) => this.tmdb.imageConfiguration({ signal }),
            signal,
          ),
        ),
      ] as const;
      try {
        const [movie, config] = await Promise.all(requests);
        signal.throwIfAborted();
        return normalize(movie, config);
      } finally {
        cancel();
        await Promise.allSettled(requests);
      }
    })();
  }
  trending(timeWindow: 'day' | 'week', signal?: AbortSignal) {
    return this.read(
      (caller) =>
        this.coordinator.get(
          catalogKey('trending', [timeWindow, 1]),
          'trending',
          moviePageSchema,
          (shared) =>
            this.movieRead(
              (signal) => this.tmdb.trending(timeWindow, { signal }),
              (movie, config) => normalizeMoviePage(movie, config, 1, true),
              shared,
            ),
          caller,
        ),
      signal,
    );
  }
  popular(page: number, signal?: AbortSignal) {
    return this.read(
      (caller) =>
        this.coordinator.get(
          catalogKey('popular', [page]),
          'popular',
          moviePageSchema,
          (shared) =>
            this.movieRead(
              (signal) => this.tmdb.popular({ page, signal }),
              (movie, config) => normalizeMoviePage(movie, config, page),
              shared,
            ),
          caller,
        ),
      signal,
    );
  }
  genres(signal?: AbortSignal) {
    return this.read(
      (caller) =>
        this.coordinator.get(
          catalogKey('genres'),
          'genres',
          genresResponseSchema,
          async (signal) =>
            genresResponseSchema.parse({
              items: (await this.tmdb.genres({ signal })).genres.map(
                normalizeGenre,
              ),
            }),
          caller,
        ),
      signal,
    );
  }
  detail(id: number, signal?: AbortSignal) {
    return this.read(
      (caller) =>
        this.coordinator.get(
          catalogKey('detail', [id, 'credits,videos']),
          'detail',
          movieDetailSchema,
          (shared) =>
            this.movieRead(
              async (signal) => {
                try {
                  return await this.tmdb.details(id, { signal });
                } catch (error) {
                  // Only a movie-operation 404 establishes that the movie is absent.
                  if (
                    error instanceof TmdbError &&
                    error.category === 'NOT_FOUND'
                  )
                    throw new NotFoundException();
                  throw error;
                }
              },
              normalizeMovieDetail,
              shared,
            ),
          caller,
        ),
      signal,
    );
  }
}
