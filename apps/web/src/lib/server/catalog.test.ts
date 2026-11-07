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
