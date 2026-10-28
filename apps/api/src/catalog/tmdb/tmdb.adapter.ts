import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { tmdbConfig } from './tmdb.config';
import { TmdbError } from './tmdb.error';
import {
  tmdbDetailSchema,
  tmdbGenresSchema,
  tmdbMoviesSchema,
  tmdbImageConfigSchema,
} from './tmdb.schemas';

export const TMDB_OPTIONS = Symbol('TMDB_OPTIONS');
export interface TmdbOptions {
  config: ReturnType<typeof tmdbConfig>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
interface ReadOptions {
  language?: string;
  signal?: AbortSignal;
}

@Injectable()
export class TmdbAdapter {
  // Native private fields also keep bearer credentials out of object inspection/JSON.
  #token: string | undefined;
  #fetch: typeof globalThis.fetch;
  #timeoutMs: number;

  constructor(@Inject(TMDB_OPTIONS) options: TmdbOptions) {
    const config = tmdbConfig({
      TMDB_ENABLED: String(options.config.enabled),
      TMDB_READ_ACCESS_TOKEN: options.config.token,
    });
    this.#token = config.enabled ? config.token : undefined;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 3000;
    if (
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      this.#timeoutMs > 10000
    )
      throw new TmdbError('CONFIGURATION');
  }

  trending(timeWindow: 'day' | 'week', options: ReadOptions = {}) {
    if (!['day', 'week'].includes(timeWindow))
      throw new TmdbError('INVALID_REQUEST');
    return this.read(
      `/trending/movie/${timeWindow}`,
      tmdbMoviesSchema,
      options,
    );
  }

  popular(options: ReadOptions & { page?: number } = {}) {
    const page = options.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 500)
      throw new TmdbError('INVALID_REQUEST');
    return this.read('/movie/popular', tmdbMoviesSchema, options, { page });
  }

  genres(options: ReadOptions = {}) {
    return this.read('/genre/movie/list', tmdbGenresSchema, options);
  }

  imageConfiguration(options: ReadOptions = {}) {
    return this.read('/configuration', tmdbImageConfigSchema, options);
  }

  details(movieId: number, options: ReadOptions = {}) {
    if (!Number.isInteger(movieId) || movieId < 1 || movieId > 2147483647)
      throw new TmdbError('INVALID_REQUEST');
    return this.read(`/movie/${movieId}`, tmdbDetailSchema, options, {
      append_to_response: 'credits,videos',
    }).then((movie) => {
      if (movie.id !== movieId) throw new TmdbError('UNEXPECTED_RESPONSE');
      return movie;
    });
  }

  private async read<T>(
    path: string,
    schema: z.ZodType<T>,
    options: ReadOptions,
    query: Record<string, number | string> = {},
  ): Promise<T> {
    if (!this.#token) throw new TmdbError('CONFIGURATION');
    const language = options.language ?? 'en-US';
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language))
      throw new TmdbError('INVALID_REQUEST');
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set('language', language);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.#timeoutMs);
    const signal = AbortSignal.any([
      deadline.signal,
      ...(options.signal ? [options.signal] : []),
    ]);
    try {
      signal.throwIfAborted();
      const response = await this.#fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.#token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        const status = response.status;
        throw new TmdbError(
          status === 401 || status === 403
            ? 'AUTHENTICATION'
            : status === 429
              ? 'RATE_LIMITED'
              : status === 404
                ? 'NOT_FOUND'
                : status >= 500
                  ? 'UPSTREAM'
                  : 'UNEXPECTED_RESPONSE',
        );
      }
      if (
        response.headers
          .get('content-type')
          ?.split(';')[0]
          .trim()
          .toLowerCase() !== 'application/json'
      ) {
        await response.body?.cancel();
        throw new TmdbError('UNEXPECTED_RESPONSE');
      }
      // Bound both body receipt and parsing input; never retain upstream bodies in errors.
      const reader = response.body?.getReader();
      if (!reader) throw new TmdbError('UNEXPECTED_RESPONSE');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024)
            throw new TmdbError('UNEXPECTED_RESPONSE');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      signal.throwIfAborted();
      try {
        const body: unknown = JSON.parse(
          Buffer.concat(chunks).toString('utf8'),
        );
        const parsed = schema.safeParse(body);
        if (parsed.success) return parsed.data;
      } catch {
        // JSON parser diagnostics can contain upstream content.
      }
      throw new TmdbError('UNEXPECTED_RESPONSE');
    } catch (error) {
      if (options.signal?.aborted) throw new TmdbError('CANCELLED');
      if (deadline.signal.aborted) throw new TmdbError('TIMEOUT');
      if (error instanceof TmdbError) throw error;
      throw new TmdbError('NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }
}
