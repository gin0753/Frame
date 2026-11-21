// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  getCatalogGenres,
  getMovieDetail,
  getPopularMovies,
  getTrendingMovies,
  searchMovies,
  discoverMovies,
  CatalogReadError,
} from './catalog';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('server catalog consumer', () => {
  it('validates a successful detail response', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const detail = {
      id: 42,
      source: 'tmdb',
      title: 'Film',
      originalTitle: 'Original',
      releaseDate: null,
      posterUrl: null,
      backdropUrl: null,
      genreIds: [18],
      genres: [{ id: 18, name: 'Drama' }],
      voteAverage: null,
      voteCount: 0,
      overview: null,
      externalUrl: 'https://www.themoviedb.org/movie/42',
      attribution: {
        provider: 'tmdb',
        sourceUrl: 'https://www.themoviedb.org/movie/42',
      },
      runtimeMinutes: null,
      directors: [],
      cast: [],
      countries: [],
      languages: [],
      budgetUsd: null,
      revenueUsd: null,
      trailerUrl: null,
      externalLinks: [],
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(detail));
    vi.stubGlobal('fetch', fetch);
    await expect(getMovieDetail({ tmdbMovieId: '42' })).resolves.toEqual(
      detail,
    );
    expect(fetch.mock.calls[0][0]).toBe(
      'http://127.0.0.1:3001/api/v1/movies/42',
    );
  });
  it('distinguishes detail not found and rate limits from availability failures', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const envelope = {
      error: {
        code: 'MOVIE_NOT_FOUND',
        message: 'Not Found',
        requestId: 'req_12345678-1234-4123-8123-123456789abc',
      },
    };
    fetch.mockResolvedValueOnce(Response.json(envelope, { status: 404 }));
    await expect(getMovieDetail({ tmdbMovieId: '42' })).rejects.toEqual(
      new CatalogReadError(404),
    );
    for (const response of [
      Response.json(
        { error: { ...envelope.error, code: 'NOT_FOUND' } },
        { status: 404 },
      ),
      new Response(null, { status: 404 }),
      new Response('{', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
      new Response('<html>Not Found</html>', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
      Response.json({ error: { code: 'MOVIE_NOT_FOUND' } }, { status: 404 }),
    ]) {
      fetch.mockResolvedValueOnce(response);
      await expect(getMovieDetail({ tmdbMovieId: '42' })).rejects.toEqual(
        new CatalogReadError(503),
      );
    }
    for (const [status, expected] of [
      [429, 429],
      [502, 503],
      [503, 503],
    ]) {
      fetch.mockResolvedValueOnce(new Response(null, { status }));
      await expect(getMovieDetail({ tmdbMovieId: '42' })).rejects.toEqual(
        new CatalogReadError(expected),
      );
    }
    fetch.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(getMovieDetail({ tmdbMovieId: '42' })).rejects.toEqual(
      new CatalogReadError(503),
    );
    for (const tmdbMovieId of ['0', '2147483648', '01'])
      expect(() => getMovieDetail({ tmdbMovieId })).toThrow();
    expect(fetch).toHaveBeenCalledTimes(10);
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(getCatalogGenres()).rejects.toEqual(new CatalogReadError(503));
  });
  it('encodes normalized searches and safely preserves rate limits', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(searchMovies(' Amélie & 東京 ', '2')).rejects.toEqual(
      new CatalogReadError(429),
    );
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('Amélie & 東京');
    expect(url.searchParams.get('page')).toBe('2');
    expect(fetch.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      redirect: 'error',
    });
  });
  it('uses fixed trusted paths, default weekly page one and private server transport', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      Response.json(
        url.includes('/genres')
          ? { items: [] }
          : {
              items: [],
              page: 1,
              pageSize: 20,
              totalPages: 0,
              totalResults: 0,
            },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const deadline = vi.spyOn(AbortSignal, 'timeout');
    await getTrendingMovies();
    await getPopularMovies({ page: '500' });
    await getCatalogGenres();
    expect(deadline).toHaveBeenCalledTimes(3);
    expect(deadline).toHaveBeenCalledWith(3000);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      'http://127.0.0.1:3001/api/v1/movies/trending?timeWindow=week&page=1',
      'http://127.0.0.1:3001/api/v1/movies/popular?page=500',
      'http://127.0.0.1:3001/api/v1/genres',
    ]);
    for (const [, options] of fetch.mock.calls) {
      expect(options.cache).toBe('no-store');
      expect(options.redirect).toBe('error');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers).toBeUndefined();
    }
  });
  it('rejects invalid input before transport and malformed upstream results without echoing them', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ private: 'INJECTED_PRIVATE_VALUE' }));
    vi.stubGlobal('fetch', fetch);
    // @ts-expect-error Runtime boundary also rejects values forbidden by the public type.
    expect(() => getTrendingMovies({ page: '2' })).toThrow();
    expect(() => getMovieDetail({ tmdbMovieId: '../private' })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(getCatalogGenres()).rejects.toThrow(
      'FRAME catalog unavailable or invalid response.',
    );
  });
});

it('Discover encodes approved filters, omits blank fields and preserves semantic validation status', async () => {
  vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
  vi.stubGlobal('fetch', fetch);
  await expect(
    discoverMovies({
      genreId: '18',
      yearFrom: '1990',
      yearTo: '',
      sort: 'rated',
      page: '1',
    }),
  ).rejects.toEqual(new CatalogReadError(400));
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/api/v1/movies/discover');
  expect(url.searchParams.get('genreId')).toBe('18');
  expect(url.searchParams.has('yearTo')).toBe(false);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    cache: 'no-store',
    redirect: 'error',
  });
  expect(() => discoverMovies({ sort: 'bad', page: '1' } as never)).toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
