const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/main');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const { CatalogService } = require('../dist/catalog/catalog.service');
const {
  tmdbDiscoveryMoviesSchema,
  tmdbMoviesSchema,
} = require('../dist/catalog/tmdb/tmdb.schemas');
const { normalizeMoviePage } = require('../dist/catalog/catalog.normalizer');
const config = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};
const movie = {
  id: 9,
  title: 'Synthetic',
  vote_count: 0,
  genre_ids: [],
  poster_path: null,
};

test('scoped compatibility preserves integrity without inferred fullness', () => {
  const base = {
    page: 2,
    results: [movie],
    total_pages: 600,
    total_results: 12001,
  };
  for (const patch of [
    {},
    { page: 500 },
    { total_pages: 2, total_results: 40 },
    { results: [] },
    { page: 3, results: [], total_pages: 2 },
  ]) {
    const input = { ...base, ...patch };
    assert.equal(tmdbDiscoveryMoviesSchema.safeParse(input).success, true);
    const result = normalizeMoviePage(input, config, input.page, false, true);
    assert.equal(result.page, input.page);
    assert.equal(result.totalPages, Math.min(input.total_pages, 500));
    assert.equal(result.totalResults, Math.min(input.total_results, 10000));
  }
  assert.equal(tmdbMoviesSchema.safeParse(base).success, false);
  for (const patch of [
    { page: 501 },
    { results: Array(21).fill(movie) },
    { total_results: 0 },
    { total_pages: 0 },
    { total_results: 0.5 },
    { total_results: Number.MAX_SAFE_INTEGER + 1 },
    { page: 3, total_pages: 2 },
    { results: [{ ...movie, id: -1 }] },
  ])
    assert.equal(
      tmdbDiscoveryMoviesSchema.safeParse({ ...base, ...patch }).success,
      false,
    );
  assert.throws(() => normalizeMoviePage(base, config, 1, false, true));
  assert.equal(
    tmdbDiscoveryMoviesSchema.safeParse({
      page: 2,
      results: [],
      total_pages: 0,
      total_results: 0,
    }).success,
    true,
  );
});

test('Search/Discover HTTP forward pages, cap totals and preserve empty requested pages', async () => {
  const app = await createApp();
  const seen = [];
  let failureStatus;
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.token' },
    fetch: async (url) => {
      if (url.pathname === '/3/configuration') return Response.json(config);
      seen.push(url);
      if (failureStatus) return new Response(null, { status: failureStatus });
      const page = Number(url.searchParams.get('page'));
      return Response.json({
        page,
        results: page === 500 ? [] : [movie],
        total_pages: 600,
        total_results: 12001,
      });
    },
  });
  const adapter = app.get(TmdbAdapter);
  for (const key of ['search', 'discover', 'imageConfiguration'])
    adapter[key] = fake[key].bind(fake);
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    for (const route of ['search?q=Alien&', 'discover?sort=rated&'])
      for (const page of [1, 2, 500]) {
        const response = await fetch(
          `${origin}/api/v1/movies/${route}page=${page}`,
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.page, page);
        assert.equal(result.totalPages, 500);
        assert.equal(result.totalResults, 10000);
        assert.equal(seen.at(-1).searchParams.get('page'), String(page));
      }
    for (const route of ['search?q=Alien&', 'discover?sort=rated&']) {
      for (const [upstream, expected] of [
        [400, 502],
        [404, 502],
        [429, 429],
        [500, 502],
      ]) {
        failureStatus = upstream;
        const before = seen.length;
        const response = await fetch(`${origin}/api/v1/movies/${route}page=4`);
        assert.equal(response.status, expected);
        assert.equal(
          seen.length - before,
          1,
          'no exceptional recovery or retry',
        );
      }
    }
  } finally {
    await app.close();
  }
});

test('page identities coalesce identical work and isolate different pages without retention', async () => {
  const app = await createApp();
  const adapter = app.get(TmdbAdapter);
  const seen = [];
  adapter.imageConfiguration = async () => config;
  adapter.search = async (_q, { page }) => {
    seen.push('s' + page);
    await new Promise((r) => setTimeout(r, 25));
    return { page, results: [], total_pages: 2, total_results: 40 };
  };
  adapter.discover = async ({ page }) => {
    seen.push('d' + page);
    await new Promise((r) => setTimeout(r, 25));
    return {
      page: Number(page),
      results: [],
      total_pages: 2,
      total_results: 40,
    };
  };
  try {
    await app.init();
    const service = app.get(CatalogService);
    await Promise.all([
      service.search('Alien', undefined, 1),
      service.search('Alien', undefined, 1),
      service.search('Alien', undefined, 2),
      service.discover({ sort: 'popular', page: '1' }),
      service.discover({ sort: 'popular', page: '1' }),
      service.discover({ sort: 'popular', page: '2' }),
    ]);
    assert.deepEqual(seen.sort(), ['d1', 'd2', 's1', 's2']);
    await service.search('Alien', undefined, 2);
    assert.equal(seen.length, 5);
  } finally {
    await app.close();
  }
});
