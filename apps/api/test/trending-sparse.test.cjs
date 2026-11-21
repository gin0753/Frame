const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/main');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const {
  tmdbTrendingMoviesSchema,
  tmdbMoviesSchema,
} = require('../dist/catalog/tmdb/tmdb.schemas');
const { normalizeMoviePage } = require('../dist/catalog/catalog.normalizer');
const contracts = require('@frame/contracts');
const movie = {
  id: 1,
  title: 'Synthetic film',
  vote_count: 0,
  genre_ids: [],
  backdrop_path: '/film.jpg',
};
const movies = (count) =>
  Array.from({ length: count }, (_, i) => ({ ...movie, id: i + 1 }));
const page = {
  page: 1,
  results: movies(19),
  total_pages: 500,
  total_results: 10000,
};
const config = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};

test('Trending accepts sparse page one without relaxing Popular or contradictory metadata', () => {
  for (const count of [1, 19, 20])
    assert.equal(
      tmdbTrendingMoviesSchema.safeParse({ ...page, results: movies(count) })
        .success,
      true,
    );
  assert.equal(
    tmdbTrendingMoviesSchema.safeParse({
      page: 1,
      results: [],
      total_pages: 0,
      total_results: 0,
    }).success,
    true,
  );
  for (const patch of [
    { results: [] },
    { total_results: 0 },
    { total_pages: 0 },
    { total_pages: 0, total_results: 0 },
    { results: movies(21) },
    { page: 2 },
    { page: 0 },
    { page: 501 },
    { results: [{ ...movie, title: '' }] },
    { total_results: -1 },
    { total_pages: -1 },
    { total_results: 0.5 },
    { total_pages: 2 },
    { total_pages: 1, total_results: 1, results: movies(2) },
  ])
    assert.equal(
      tmdbTrendingMoviesSchema.safeParse({ ...page, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  assert.equal(tmdbMoviesSchema.safeParse(page).success, false);
  assert.equal(
    tmdbMoviesSchema.safeParse({ ...page, results: movies(20) }).success,
    true,
  );
  const normalized = normalizeMoviePage(page, config, 1, true);
  assert.equal(normalized.items.length, 19);
  assert.equal(normalized.totalPages, 500);
  assert.equal(normalized.totalResults, 10000);
  assert.throws(() =>
    normalizeMoviePage({ ...page, page: 2 }, config, 1, true),
  );
});

test('real catalog HTTP preserves a synthetic 19-item Trending page', async () => {
  const app = await createApp();
  const adapter = app.get(TmdbAdapter);
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.token' },
    fetch: async (url) =>
      Response.json(url.pathname === '/3/configuration' ? config : page),
  });
  adapter.trending = fake.trending.bind(fake);
  adapter.imageConfiguration = fake.imageConfiguration.bind(fake);
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(
      (await app.getUrl()) + '/api/v1/movies/trending',
    );
    assert.equal(response.status, 200);
    const body = contracts.moviePageSchema.parse(await response.json());
    assert.equal(body.items.length, 19);
    assert.equal(body.totalPages, 500);
    assert.equal(body.totalResults, 10000);
  } finally {
    await app.close();
  }
});
