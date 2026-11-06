const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/main');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { catalogPolicy } = require('../dist/catalog/catalog.policy');
const { TmdbError } = require('../dist/catalog/tmdb/tmdb.error');
const config = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};
const movie = (id) => ({
  id,
  title: 'Synthetic ' + id,
  vote_count: 0,
  genre_ids: [18],
  release_date: null,
  poster_path: null,
  backdrop_path: null,
  overview: null,
});
test('Discover HTTP dispatch, exact mapping, validation, totals and failures', async () => {
  const app = await createApp();
  const urls = [];
  let mode = 'normal';
  let dictionaryFailure = false;
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.token' },
    fetch: async (url) => {
      urls.push(new URL(url));
      if (url.pathname === '/3/configuration') return Response.json(config);
      if (url.pathname === '/3/genre/movie/list')
        return dictionaryFailure
          ? new Response(null, { status: 500 })
          : Response.json({ genres: [{ id: 18, name: 'Drama' }] });
      assert.equal(url.pathname, '/3/discover/movie');
      if (mode === '429' || mode === '500')
        return new Response(null, { status: Number(mode) });
      const count = mode === 'empty' ? 0 : mode === 'large' ? 20 : 2;
      return Response.json({
        page: 1,
        results: Array.from({ length: count }, (_, i) =>
          movie(mode === 'large' ? i + 1 : 9 - i),
        ),
        total_pages: mode === 'large' ? 601 : count ? 1 : 0,
        total_results: mode === 'large' ? 12001 : count,
      });
    },
  });
  const adapter = app.get(TmdbAdapter);
  for (const method of ['discover', 'genres', 'imageConfiguration'])
    adapter[method] = fake[method].bind(fake);
  adapter.details = async () => {
    throw Error('Unexpected details');
  };
  try {
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1/movies/discover';
    const get = async (q) => fetch(base + (q ? '?' + q : ''));
    for (const [q, sort, threshold] of [
      ['', 'popularity.desc', null],
      [
        'genreId=18&yearFrom=1990&yearTo=1999&sort=rated',
        'vote_average.desc',
        '100',
      ],
      ['sort=newest&yearFrom=1800', 'primary_release_date.desc', null],
      ['yearTo=2100', 'popularity.desc', null],
    ]) {
      const response = await get(q);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.deepEqual(
        body.items.map((m) => m.id),
        [9, 8],
      );
      assert.equal(body.items[0].releaseDate, null);
      const u = urls.filter((u) => u.pathname === '/3/discover/movie').at(-1);
      const p = u.searchParams;
      assert.equal(p.get('sort_by'), sort);
      assert.equal(p.get('vote_count.gte'), threshold);
      assert.equal(p.get('language'), 'en-US');
      assert.equal(p.get('include_adult'), 'false');
      assert.equal(p.get('include_video'), 'false');
      assert.equal(p.get('page'), '1');
      const input = new URLSearchParams(q);
      assert.equal(p.get('with_genres'), input.get('genreId'));
      assert.equal(
        p.get('primary_release_date.gte'),
        input.has('yearFrom') ? input.get('yearFrom') + '-01-01' : null,
      );
      assert.equal(
        p.get('primary_release_date.lte'),
        input.has('yearTo') ? input.get('yearTo') + '-12-31' : null,
      );
      assert.equal(p.has('year'), false);
      assert.equal(p.has('release_date.gte'), false);
    }
    for (const q of [
      'page=2',
      'sort=bad',
      'genreId=0',
      'genreId=18&genreId=28',
      'yearFrom=2001&yearTo=2000',
      'yearFrom=1799',
      'yearTo=2101',
      'yearFrom=abc',
      'sort=rated&sort=popular',
      'q=alien',
      'unknown=x',
    ]) {
      const count = urls.length;
      assert.equal((await get(q)).status, 400, q);
      assert.equal(urls.length, count);
    }
    let count = urls.filter((u) => u.pathname === '/3/discover/movie').length;
    assert.equal((await get('genreId=999')).status, 400);
    assert.equal(
      urls.filter((u) => u.pathname === '/3/discover/movie').length,
      count,
    );
    dictionaryFailure = true;
    assert.equal((await get('genreId=18')).status, 502);
    assert.equal(
      urls.filter((u) => u.pathname === '/3/discover/movie').length,
      count,
    );
    assert.equal((await get('yearFrom=1990')).status, 200);
    dictionaryFailure = false;
    mode = 'large';
    let body = await (await get('')).json();
    assert.equal(body.totalPages, 500);
    assert.equal(body.totalResults, 10000);
    assert.equal(body.pageSize, 20);
    mode = 'empty';
    body = await (await get('')).json();
    assert.deepEqual(body, {
      items: [],
      page: 1,
      pageSize: 20,
      totalPages: 0,
      totalResults: 0,
    });
    for (const [m, status] of [
      ['429', 429],
      ['500', 502],
    ]) {
      mode = m;
      assert.equal((await get('')).status, status);
    }
    adapter.discover = async () => {
      throw new TmdbError('TIMEOUT');
    };
    assert.equal((await get('')).status, 503);
    assert.equal(catalogPolicy({}).ttlMs.discover, 0);
    assert.equal(catalogPolicy({}).retentionEnabled, false);
    assert.throws(() => catalogPolicy({ CATALOG_CACHE_ENABLED: 'true' }));
  } finally {
    await app.close();
  }
});
test('Discover normalized identity coalesces only equivalent filters; sequential results not retained', async () => {
  const app = await createApp();
  const adapter = app.get(TmdbAdapter);
  const seen = [];
  adapter.imageConfiguration = async () => config;
  adapter.genres = async () => ({ genres: [{ id: 18, name: 'Drama' }] });
  adapter.discover = async (q) => {
    seen.push(q);
    await new Promise((r) => setTimeout(r, 30));
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  };
  try {
    await app.init();
    const service = app.get(CatalogService);
    const q = { sort: 'popular', page: '1' };
    await Promise.all([
      service.discover(q),
      service.discover({ ...q, genreId: '', yearFrom: '' }),
      service.discover({ ...q, genreId: '18' }),
      service.discover({ ...q, yearFrom: '1990' }),
      service.discover({ ...q, yearTo: '1999' }),
      service.discover({ ...q, sort: 'rated' }),
      service.discover({ ...q, sort: 'newest' }),
    ]);
    assert.equal(seen.length, 6);
    await service.discover(q);
    assert.equal(seen.length, 7);
  } finally {
    await app.close();
  }
});
test('selected Genre uses the same deadline and caller cancellation reaches its dictionary', async () => {
  const app = await createApp();
  const adapter = app.get(TmdbAdapter);
  let movieCalls = 0;
  let aborted = 0;
  adapter.imageConfiguration = async () => config;
  adapter.genres = ({ signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          aborted++;
          reject(new TmdbError('CANCELLED'));
        },
        { once: true },
      );
    });
  adapter.discover = async () => {
    movieCalls++;
    throw Error('must not run');
  };
  try {
    await app.init();
    const service = app.get(CatalogService);
    const controller = new AbortController();
    const pending = service.discover(
      { genreId: '18', sort: 'popular', page: '1' },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending, (e) => e.getStatus() === 503);
    assert.equal(movieCalls, 0);
    assert.ok(aborted);
    const start = performance.now();
    await assert.rejects(
      service.discover({ genreId: '18', sort: 'popular', page: '1' }),
      (e) => e.getStatus() === 503,
    );
    assert.ok(performance.now() - start < 2900);
    assert.equal(movieCalls, 0);
    // Dictionary work consumes the movie operation's budget; it cannot grant
    // a fresh 2200 ms after membership validation succeeds.
    adapter.genres = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { genres: [{ id: 18, name: 'Drama' }] };
    };
    let movieAborted = false;
    adapter.discover = (_query, { signal }) =>
      new Promise((_resolve, reject) => {
        movieCalls++;
        signal.addEventListener(
          'abort',
          () => {
            movieAborted = true;
            reject(new TmdbError('CANCELLED'));
          },
          { once: true },
        );
      });
    const combinedStart = performance.now();
    await assert.rejects(
      service.discover({ genreId: '18', sort: 'popular', page: '1' }),
      (e) => e.getStatus() === 503,
    );
    assert.equal(movieCalls, 1);
    assert.equal(movieAborted, true);
    assert.ok(performance.now() - combinedStart < 2900);
  } finally {
    await app.close();
  }
});
