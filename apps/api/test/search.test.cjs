const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/main');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { TmdbError } = require('../dist/catalog/tmdb/tmdb.error');
const { catalogPolicy } = require('../dist/catalog/catalog.policy');
const { apiErrorSchema } = require('@frame/contracts');
const config = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};
const movie = (id) => ({
  id,
  title: `Synthetic ${id}`,
  vote_count: 0,
  genre_ids: [],
  release_date: null,
  poster_path: null,
  backdrop_path: null,
  overview: null,
});
const json = (data) => Response.json(data);

test('search real HTTP dispatch, encoding, ordering, validation, errors and no retention', async () => {
  const app = await createApp();
  const observed = [];
  let failure;
  let empty = false;
  let large = false;
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.token' },
    fetch: async (url) => {
      observed.push(new URL(url));
      if (url.pathname === '/3/configuration') return json(config);
      assert.equal(url.pathname, '/3/search/movie');
      if (failure) return new Response(null, { status: failure });
      return json({
        page: 1,
        results: empty
          ? []
          : large
            ? Array.from({ length: 20 }, (_, i) => movie(i + 1))
            : [movie(9), movie(2)],
        total_pages: empty ? 0 : large ? 601 : 1,
        total_results: empty ? 0 : large ? 12001 : 2,
      });
    },
  });
  const adapter = app.get(TmdbAdapter);
  adapter.search = fake.search.bind(fake);
  adapter.imageConfiguration = fake.imageConfiguration.bind(fake);
  adapter.details = async () => {
    throw new Error('Search reached detail handler');
  };
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const q = 'Amélie & A  B + 東京?';
    const path = '/api/v1/movies/search?';
    const response = await fetch(
      origin + path + new URLSearchParams({ q: ` ${q} ` }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(
      body.items.map((m) => m.id),
      [9, 2],
    );
    assert.equal(body.items[0].overview, null);
    assert.equal(body.items[0].posterUrl, null);
    const search = observed.find((u) => u.pathname === '/3/search/movie');
    assert.equal(search.searchParams.get('query'), q);
    assert.equal(search.searchParams.get('language'), 'en-US');
    assert.equal(search.searchParams.get('include_adult'), 'false');
    assert.equal(search.searchParams.get('page'), '1');
    const count = observed.length;
    for (const query of [
      '',
      'q=',
      'q=%20',
      'q=a&q=b',
      'q=a&page=1&page=1',
      'q=a&page=2',
      'q=a&sort=title',
      `q=${'a'.repeat(201)}`,
    ]) {
      const invalid = await fetch(origin + path + query);
      assert.equal(invalid.status, 400, query);
      assert.equal(
        apiErrorSchema.parse(await invalid.json()).error.code,
        'VALIDATION_ERROR',
      );
    }
    assert.equal(observed.length, count);
    empty = true;
    assert.deepEqual(
      (await (await fetch(origin + path + 'q=empty&page=1')).json()).items,
      [],
    );
    empty = false;
    large = true;
    const uncapped = await (await fetch(origin + path + 'q=large')).json();
    assert.equal(uncapped.totalPages, 601);
    assert.equal(uncapped.totalResults, 12001);
    for (const [status, expected] of [
      [429, 429],
      [500, 502],
      [401, 503],
    ]) {
      failure = status;
      const failed = await fetch(origin + path + 'q=failure');
      assert.equal(failed.status, expected);
      assert.equal(
        apiErrorSchema.parse(await failed.json()).error.code,
        status === 429 ? 'RATE_LIMITED' : 'CATALOG_UNAVAILABLE',
      );
    }
    adapter.search = async () => {
      throw new TmdbError('TIMEOUT');
    };
    assert.equal((await fetch(origin + path + 'q=timeout')).status, 503);
    assert.equal(catalogPolicy({}).retentionEnabled, false);
    assert.equal(catalogPolicy({}).ttlMs.search, 0);
    assert.throws(() => catalogPolicy({ CATALOG_CACHE_ENABLED: 'true' }));
  } finally {
    await app.close();
  }
});

test('equivalent normalized searches coalesce, case and internal spacing isolate, sequential calls are not retained', async () => {
  const app = await createApp();
  const adapter = app.get(TmdbAdapter);
  const calls = [];
  adapter.imageConfiguration = async () => config;
  adapter.search = async (q) => {
    calls.push(q);
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  };
  try {
    await app.init();
    const service = app.get(CatalogService);
    await Promise.all([
      service.search(' Alien '),
      service.search('Alien'),
      service.search('alien'),
      service.search('A  B'),
      service.search('A B'),
    ]);
    assert.deepEqual(calls.sort(), ['A  B', 'A B', 'Alien', 'alien'].sort());
    await service.search('Alien');
    assert.equal(calls.filter((q) => q === 'Alien').length, 2);
  } finally {
    await app.close();
  }
});
