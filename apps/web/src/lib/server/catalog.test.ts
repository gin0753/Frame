// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  getCatalogGenres,
  getMovieDetail,
  getPopularMovies,
  getTrendingMovies,
} from './catalog';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('server catalog consumer', () => {
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
