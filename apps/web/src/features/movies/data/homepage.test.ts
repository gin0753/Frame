// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/catalog', () => ({
  getTrendingMovies: vi.fn(),
  getPopularMovies: vi.fn(),
  getCatalogGenres: vi.fn(),
  getMovieDetail: vi.fn(),
}));
import * as catalog from '@/lib/server/catalog';
import { createHomepageData } from './homepage';
import type { MovieSummary, MovieDetail } from '@frame/contracts';

const movie = (id: number): MovieSummary => ({
  id,
  source: 'tmdb',
  title: `Movie ${id}`,
  releaseDate: null,
  overview: 'Summary',
  genreIds: [18],
  posterUrl: null,
  backdropUrl: `https://image.tmdb.org/t/p/w1280/movie${id}.jpg`,
  voteAverage: null,
  voteCount: 0,
  externalUrl: `https://www.themoviedb.org/movie/${id}`,
  attribution: {
    provider: 'tmdb',
    sourceUrl: `https://www.themoviedb.org/movie/${id}`,
  },
});
const page = (items: MovieSummary[]) => ({
  items,
  page: 1,
  pageSize: 20 as const,
  totalPages: items.length ? 1 : 0,
  totalResults: items.length,
});
const detail: MovieDetail = {
  ...movie(1),
  overview: 'Detail overview',
  runtimeMinutes: 90,
  directors: [],
  cast: [],
  countries: [],
  languages: [],
  budgetUsd: null,
  revenueUsd: null,
  trailerUrl: null,
  externalLinks: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(catalog.getTrendingMovies).mockResolvedValue(
    page([movie(1), movie(2)]),
  );
  vi.mocked(catalog.getPopularMovies).mockResolvedValue(
    page([movie(2), movie(3)]),
  );
  vi.mocked(catalog.getCatalogGenres).mockResolvedValue({
    items: [{ id: 18, name: 'Drama' }],
  });
  vi.mocked(catalog.getMovieDetail).mockResolvedValue(detail);
});
it('settles a total outage without rejecting or substituting fixtures', async () => {
  vi.mocked(catalog.getTrendingMovies).mockRejectedValue(new Error());
  vi.mocked(catalog.getPopularMovies).mockRejectedValue(new Error());
  vi.mocked(catalog.getCatalogGenres).mockRejectedValue(new Error());
  const data = createHomepageData();
  expect(await data.trending).toEqual({ status: 'failure' });
  expect(await data.popular).toEqual({ status: 'failure' });
  expect(await data.genres).toEqual({ status: 'failure' });
  expect(await data.hero).toEqual([]);
  expect(catalog.getMovieDetail).not.toHaveBeenCalled();
});
it('shares one trending read, enriches only hero, and forms a distinct live genre pool', async () => {
  const data = createHomepageData();
  expect(catalog.getTrendingMovies).toHaveBeenCalledTimes(1);
  expect(catalog.getPopularMovies).toHaveBeenCalledTimes(1);
  expect(catalog.getCatalogGenres).toHaveBeenCalledTimes(1);
  expect(await data.hero).toMatchObject([
    {
      synopsis: 'Detail overview',
      runtimeSeconds: 5400,
      destinationLabel: 'TMDB',
    },
    { synopsis: 'Summary', runtimeSeconds: null },
  ]);
  expect(await data.genres).toMatchObject({
    choices: ['Drama'],
    data: [{ id: 'tmdb:1' }, { id: 'tmdb:2' }, { id: 'tmdb:3' }],
  });
  expect(catalog.getMovieDetail).toHaveBeenCalledTimes(1);
  expect(catalog.getMovieDetail).toHaveBeenCalledWith({ tmdbMovieId: '1' });
});
it.each(['getTrendingMovies', 'getPopularMovies', 'getCatalogGenres'] as const)(
  'isolates %s failure',
  async (method) => {
    vi.mocked(catalog[method]).mockRejectedValue(
      new Error('private diagnostics'),
    );
    const data = createHomepageData();
    const [t, p, g, h] = await Promise.all([
      data.trending,
      data.popular,
      data.genres,
      data.hero,
    ]);
    expect(t.status).toBe(
      method === 'getTrendingMovies' ? 'failure' : 'success',
    );
    expect(p.status).toBe(
      method === 'getPopularMovies' ? 'failure' : 'success',
    );
    if (method === 'getCatalogGenres') {
      expect(g.status).toBe('failure');
      if (t.status !== 'failure') expect(t.data[0].genres).toEqual([]);
    } else expect(g).toMatchObject({ status: 'success', partial: true });
    if (method === 'getTrendingMovies') expect(h).toEqual([]);
  },
);
it('settles empty sources without details or fabricated fixture content', async () => {
  vi.mocked(catalog.getTrendingMovies).mockResolvedValue(page([]));
  vi.mocked(catalog.getPopularMovies).mockResolvedValue(page([]));
  const data = createHomepageData();
  expect(await data.trending).toEqual({ status: 'empty', data: [] });
  expect(await data.popular).toEqual({ status: 'empty', data: [] });
  expect(await data.hero).toEqual([]);
  expect(await data.genres).toMatchObject({ status: 'empty', data: [] });
  expect(catalog.getMovieDetail).not.toHaveBeenCalled();
});
it('renders rails without waiting for hero detail and trending without waiting for popular', async () => {
  let resolveDetail!: (value: MovieDetail) => void;
  let resolvePopular!: (value: ReturnType<typeof page>) => void;
  vi.mocked(catalog.getMovieDetail).mockReturnValue(
    new Promise((resolve) => {
      resolveDetail = resolve;
    }),
  );
  vi.mocked(catalog.getPopularMovies).mockReturnValue(
    new Promise((resolve) => {
      resolvePopular = resolve;
    }),
  );
  const data = createHomepageData();
  expect((await data.trending).status).toBe('success');
  resolvePopular(page([movie(3)]));
  expect((await data.popular).status).toBe('success');
  resolveDetail(detail);
  expect((await data.hero)[0]?.id).toBe('tmdb:1');
});
it.each(['failure', 'mismatch'] as const)(
  'keeps summary for detail %s without retry',
  async (mode) => {
    if (mode === 'failure')
      vi.mocked(catalog.getMovieDetail).mockRejectedValue(
        new Error('unavailable'),
      );
    else
      vi.mocked(catalog.getMovieDetail).mockResolvedValue({
        ...detail,
        id: 99,
      });
    expect((await createHomepageData().hero)[0]).toMatchObject({
      synopsis: 'Summary',
      runtimeSeconds: null,
    });
    expect(catalog.getMovieDetail).toHaveBeenCalledTimes(1);
  },
);

it('keeps the preview pool when the genre dictionary succeeds empty', async () => {
  vi.mocked(catalog.getCatalogGenres).mockResolvedValue({ items: [] });
  expect(await createHomepageData().genres).toMatchObject({
    status: 'success',
    choices: [],
    data: [{ id: 'tmdb:1' }, { id: 'tmdb:2' }, { id: 'tmdb:3' }],
    partial: false,
  });
});
it('distinguishes an empty partial pool from total source failure', async () => {
  vi.mocked(catalog.getTrendingMovies).mockRejectedValue(new Error());
  vi.mocked(catalog.getPopularMovies).mockResolvedValue(page([]));
  expect(await createHomepageData().genres).toMatchObject({
    status: 'empty',
    data: [],
    choices: [],
    partial: true,
  });
});

it('enriches only the first of five eligible featured films without additional Catalog reads', async () => {
  vi.mocked(catalog.getTrendingMovies).mockResolvedValue(
    page(Array.from({ length: 9 }, (_, index) => movie(index + 1))),
  );
  const data = createHomepageData();
  const heroes = await data.hero;
  expect(heroes.map((item) => item.id)).toEqual([
    'tmdb:1',
    'tmdb:2',
    'tmdb:3',
    'tmdb:4',
    'tmdb:5',
  ]);
  expect(heroes[0]).toMatchObject({
    synopsis: 'Detail overview',
    runtimeSeconds: 5400,
  });
  expect(
    heroes
      .slice(1)
      .every(
        (item) => item.synopsis === 'Summary' && item.runtimeSeconds === null,
      ),
  ).toBe(true);
  expect(catalog.getMovieDetail).toHaveBeenCalledExactlyOnceWith({
    tmdbMovieId: '1',
  });
  expect(catalog.getTrendingMovies).toHaveBeenCalledTimes(1);
  expect((await data.trending).status).toBe('success');
});
