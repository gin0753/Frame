const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../dist/main');
const { AppModule } = require('../dist/app.module');

const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const { TmdbError } = require('../dist/catalog/tmdb/tmdb.error');
const schemas = require('../dist/catalog/tmdb/tmdb.schemas');
const n = require('../dist/catalog/catalog.normalizer');
const c = require('@frame/contracts');
const movie = {
  id: 42,
  title: 'Synthetic film',
  vote_count: 0,
  vote_average: 0,
  genre_ids: [18],
  release_date: '',
  poster_path: null,
  backdrop_path: '/synthetic.jpg',
  overview: '',
};
const config = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};
const detail = {
  ...movie,
  genres: [{ id: 18, name: 'Drama' }],
  runtime: 90,
  budget: 0,
  revenue: 123,
  credits: {
    crew: [{ id: 1, name: 'Director', job: 'Director' }],
    cast: [{ id: 2, name: 'Actor', character: '', order: 0 }],
  },
  videos: {
    results: [
      {
        id: 'synthetic',
        site: 'YouTube',
        type: 'Trailer',
        official: true,
        key: 'abcdefghijk',
      },
    ],
  },
  production_countries: [{ iso_3166_1: 'AU', name: 'Australia' }],
  spoken_languages: [{ iso_639_1: 'en', english_name: 'English' }],
};
const page = { page: 1, results: [movie], total_pages: 1, total_results: 1 };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('provider schemas reject malformed required fields and allow null optional data / upstream additions', () => {
  assert.equal(
    schemas.tmdbSummarySchema.safeParse({ ...movie, future: true }).success,
    true,
  );
  for (const patch of [
    { id: undefined },
    { id: -1 },
    { title: ' ' },
    { vote_count: undefined },
    { vote_count: -1 },
    { vote_average: 11 },
    { genre_ids: null },
    { genre_ids: ['18'] },
    { media_type: 'tv' },
    { release_date: '2025-02-30' },
    { poster_path: 'https://evil.test/a.jpg' },
  ])
    assert.equal(
      schemas.tmdbSummarySchema.safeParse({ ...movie, ...patch }).success,
      false,
    );
  assert.equal(
    schemas.tmdbSummarySchema.safeParse({
      ...movie,
      release_date: null,
      vote_average: null,
      poster_path: undefined,
    }).success,
    true,
  );
  assert.equal(schemas.tmdbDetailSchema.safeParse(detail).success, true);
  assert.equal(schemas.tmdbImageConfigSchema.safeParse(config).success, true);
  for (const patch of [
    { secure_base_url: 'https://evil.test/' },
    { poster_sizes: ['original'] },
    { backdrop_sizes: [] },
  ])
    assert.equal(
      schemas.tmdbImageConfigSchema.safeParse({
        images: { ...config.images, ...patch },
      }).success,
      false,
    );
  assert.equal(
    schemas.tmdbDetailSchema.safeParse({
      ...detail,
      credits: { cast: 'bad', crew: [] },
    }).success,
    false,
  );
  assert.equal(
    schemas.tmdbGenresSchema.safeParse({
      genres: [{ id: 18, name: 'Drama', extra: true }],
    }).success,
    true,
  );
  for (const patch of [
    { total_pages: -1 },
    { total_results: 0 },
    { page: 0 },
    { total_pages: 2 },
    { results: [] },
  ])
    assert.equal(
      schemas.tmdbMoviesSchema.safeParse({ ...page, ...patch }).success,
      false,
    );
});
test('pure normalization validates output, preserves identity/votes and does not mutate inputs', () => {
  const before = structuredClone(detail);
  const output = n.normalizeMovieDetail(detail, config);
  assert.deepEqual(detail, before);
  c.movieDetailSchema.parse(output);
  assert.equal(output.id, 42);
  assert.equal(output.source, 'tmdb');
  assert.equal(output.voteAverage, 0);
  assert.equal(output.voteCount, 0);
  assert.equal(output.releaseDate, null);
  const known = n.normalizeMovieSummary(
    { ...movie, release_date: '2020-02-29', poster_path: '/synthetic.jpg' },
    config,
  );
  assert.equal(known.releaseDate, '2020-02-29');
  assert.equal(
    known.posterUrl,
    'https://image.tmdb.org/t/p/w500/synthetic.jpg',
  );
  assert.equal(output.overview, null);
  assert.equal(output.posterUrl, null);
  assert.equal(
    output.backdropUrl,
    'https://image.tmdb.org/t/p/w1280/synthetic.jpg',
  );
  assert.deepEqual(output.genreIds, [18]);
  assert.equal(output.runtimeMinutes, 90);
  assert.equal(output.cast[0].character, null);
  assert.equal(output.directors[0].name, 'Director');
  assert.equal(output.countries[0].code, 'AU');
  assert.equal(output.languages[0].code, 'en');
  assert.equal(
    output.trailerUrl,
    'https://www.youtube.com/watch?v=abcdefghijk',
  );
  assert.equal(output.budgetUsd, null);
  assert.equal(output.revenueUsd, null); // Rights not verified.
  const unknown = n.normalizeMovieDetail(
    { ...detail, runtime: 0, credits: null, videos: null },
    config,
  );
  assert.equal(unknown.runtimeMinutes, null);
  assert.deepEqual(unknown.cast, []);
  assert.equal(unknown.trailerUrl, null);
  assert.throws(() => n.normalizeMoviePage(page, config, 2));
  const big = {
    ...page,
    results: Array.from({ length: 20 }, (_, index) => ({
      ...movie,
      id: index + 1,
    })),
    total_pages: 600,
    total_results: 12000,
  };
  assert.equal(n.normalizeMoviePage(big, config, 1, true).totalResults, 12000);
  assert.equal(n.normalizeMoviePage(big, config, 1, true).totalPages, 600);
  assert.equal(n.normalizeMoviePage(big, config, 1).totalResults, 10000);
  assert.equal(n.normalizeMoviePage(big, config, 1).totalPages, 500);
  assert.deepEqual(
    n.normalizeMoviePage(
      { page: 1, results: [], total_pages: 0, total_results: 0 },
      config,
      1,
    ).items,
    [],
  );
});

test('real production Nest HTTP catalog routes, schemas, errors and provider-only transport injection', async () => {
  const observed = [];
  let failure;
  // Override only the external transport on the real application adapter instance.
  const app = await createApp(AppModule);
  const adapter = app.get(TmdbAdapter);
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.token' },
    fetch: async (url) => {
      observed.push(new URL(url));
      if (failure === 'malformed') return json({ secret: 'PRIVATE_UPSTREAM' });
      if (failure) throw new TmdbError(failure);
      if (url.pathname === '/3/configuration') return json(config);
      if (url.pathname === '/3/genre/movie/list')
        return json({ genres: [{ id: 18, name: 'Drama' }] });
      if (url.pathname === '/3/movie/42') return json(detail);
      const number = Number(url.searchParams.get('page') ?? 1);
      return json({
        ...page,
        page: number,
        results: number === 1 ? [movie] : [],
      });
    },
  });
  for (const method of [
    'trending',
    'popular',
    'genres',
    'details',
    'imageConfiguration',
  ])
    adapter[method] = fake[method].bind(fake);
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    for (const [key, suffix] of [
      ['trending', ''],
      ['trending', '?page=1'],
      ['trending', '?timeWindow=day'],
      ['trending', '?timeWindow=week'],
      ['popular', '?page=2'],
      ['genres', ''],
      ['detail', ''],
    ]) {
      const contract = c.catalogContracts[key];
      const response = await fetch(
        origin + contract.path.replace('{tmdbMovieId}', '42') + suffix,
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = contract.response.parse(await response.json());
      if (key === 'trending') {
        assert.equal(body.page, 1);
        assert.equal(body.totalResults, 1);
      }
    }
    assert.equal(observed[0].pathname, '/3/trending/movie/week');
    assert.ok(
      observed
        .filter((url) => url.pathname.includes('/trending/'))
        .every((url) => !url.searchParams.has('page')),
    );
    assert.equal(
      observed
        .find((url) => url.pathname === '/3/movie/42')
        .searchParams.get('append_to_response'),
      'credits,videos',
    );
    const count = observed.length;
    for (const suffix of [
      '?page=2',
      '?page=0',
      '?page=-1',
      '?page=1.5',
      '?page=',
      '?page=01',
      '?page=1&page=1',
      '?timeWindow=month',
      '?language=en',
    ]) {
      const response = await fetch(origin + '/api/v1/movies/trending' + suffix);
      assert.equal(response.status, 400);
      const body = c.apiErrorSchema.parse(await response.json());
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    }
    for (const path of [
      '/movies/0',
      '/movies/2147483648',
      '/movies/42?extra=yes',
      '/genres?page=1',
      '/movies/popular?page=501',
    ])
      assert.equal((await fetch(origin + '/api/v1' + path)).status, 400);
    assert.equal(observed.length, count);
    for (const [category, status, code] of [
      ['CONFIGURATION', 503, 'CATALOG_UNAVAILABLE'],
      ['AUTHENTICATION', 503, 'CATALOG_UNAVAILABLE'],
      ['TIMEOUT', 503, 'CATALOG_UNAVAILABLE'],
      ['NETWORK', 502, 'CATALOG_UNAVAILABLE'],
      ['UPSTREAM', 502, 'CATALOG_UNAVAILABLE'],
      ['RATE_LIMITED', 429, 'RATE_LIMITED'],
      ['NOT_FOUND', 404, 'NOT_FOUND'],
      ['malformed', 502, 'CATALOG_UNAVAILABLE'],
    ]) {
      failure = category;
      // Adapter fetch errors are intentionally sanitized as NETWORK. Provider categories
      // are injected at the adapter boundary for the public mapping regression.
      if (category !== 'malformed')
        adapter.details = async () => {
          throw new TmdbError(category);
        };
      else adapter.details = fake.details.bind(fake);
      const response = await fetch(origin + '/api/v1/movies/42');
      assert.equal(response.status, status);
      const raw = await response.text();
      assert.equal(c.apiErrorSchema.parse(JSON.parse(raw)).error.code, code);
      assert.ok(
        !/synthetic.token|PRIVATE_UPSTREAM|stack|Authorization/.test(raw),
      );
    }
    failure = undefined;
    adapter.details = fake.details.bind(fake);
    adapter.imageConfiguration = async () => {
      throw new TmdbError('NOT_FOUND');
    };
    const configFailure = await fetch(origin + '/api/v1/movies/42');
    assert.equal(configFailure.status, 502); // Configuration 404 is not a missing movie.
    assert.equal(
      c.apiErrorSchema.parse(await configFailure.json()).error.code,
      'CATALOG_UNAVAILABLE',
    );
    adapter.details = async () => {
      throw new Error('PRIVATE_UPSTREAM');
    };
    adapter.imageConfiguration = fake.imageConfiguration.bind(fake);
    const unexpected = await fetch(origin + '/api/v1/movies/42');
    assert.equal(unexpected.status, 500);
    assert.equal(
      c.apiErrorSchema.parse(await unexpected.json()).error.code,
      'INTERNAL_ERROR',
    );
  } finally {
    await app.close();
  }
});

test('disabled provider fails safely over real HTTP', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch((await app.getUrl()) + '/api/v1/genres');
    assert.equal(response.status, 503);
    assert.equal(
      c.apiErrorSchema.parse(await response.json()).error.code,
      'CATALOG_UNAVAILABLE',
    );
  } finally {
    await app.close();
  }
});

// The production Nest application and real HTTP listener remain in this regression.
// Only external TMDB fetch is replaced; the actual adapter still owns signals/body parsing.
async function delayedCatalog(mode = 'slow') {
  const app = await createApp();
  const real = app.get(TmdbAdapter);
  let bothStarted;
  let allFinished;
  const state = {
    active: 0,
    maximum: 0,
    started: 0,
    cancelled: 0,
    abortNames: [],
    bothStarted: new Promise((resolve) => {
      bothStarted = resolve;
    }),
    allFinished: new Promise((resolve) => {
      allFinished = resolve;
    }),
  };
  const fake = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.deadline' },
    fetch: (url, { signal }) =>
      new Promise((resolve, reject) => {
        state.started++;
        state.active++;
        state.maximum = Math.max(state.maximum, state.active);
        if (state.active === 2) bothStarted();
        let timer;
        let settled = false;
        const finish = (cancelled) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          state.active--;
          if (cancelled) {
            state.cancelled++;
            state.abortNames.push(signal.reason?.name);
          }
          if (state.active === 0 && state.started >= 2) allFinished();
          if (cancelled) reject(new Error('synthetic cancellation'));
          else if (mode === 'failure' && url.pathname !== '/3/configuration')
            resolve(json({}, 429));
          else
            resolve(
              json(
                url.pathname === '/3/configuration'
                  ? config
                  : url.pathname === '/3/movie/42'
                    ? detail
                    : page,
              ),
            );
        };
        const abort = () => finish(true);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else if (mode === 'slow') timer = setTimeout(() => finish(false), 1700);
        else if (mode === 'failure' && url.pathname !== '/3/configuration')
          timer = setTimeout(() => finish(false), 10);
      }),
  });
  for (const method of ['trending', 'popular', 'details', 'imageConfiguration'])
    real[method] = fake[method].bind(fake);
  try {
    await app.listen(0, '127.0.0.1');
  } catch (error) {
    await app.close();
    throw error;
  }
  return { app, state, origin: await app.getUrl() };
}

test(
  'real HTTP concurrent 1.7-second provider reads fit the unchanged three-second caller budget',
  { timeout: 15000 },
  async () => {
    const { CATALOG_DEADLINE_MS } = require('../dist/catalog/catalog.service');
    assert.equal(CATALOG_DEADLINE_MS, 2200);
    const { app, state, origin } = await delayedCatalog();
    try {
      for (const [path, schema, expected] of [
        [
          '/movies/trending',
          c.moviePageSchema,
          n.normalizeMoviePage(page, config, 1, true),
        ],
        [
          '/movies/popular',
          c.moviePageSchema,
          n.normalizeMoviePage(page, config, 1),
        ],
        [
          '/movies/42',
          c.movieDetailSchema,
          n.normalizeMovieDetail(detail, config),
        ],
      ]) {
        const started = performance.now();
        const response = await fetch(origin + '/api/v1' + path, {
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(schema.parse(await response.json()), expected);
        assert.ok(
          performance.now() - started < 4000,
          'Includes 1000 ms scheduling tolerance; the actual caller signal remains 3000 ms.',
        );
        assert.equal(state.active, 0);
      }
      assert.equal(state.maximum, 2); // Detects accidental sequentialization without tight stopwatch assertions.
      assert.equal(state.started, 6);
      assert.equal(state.cancelled, 0);
    } finally {
      await app.close();
    }
  },
);

test(
  'real HTTP shared deadline aborts and drains both stalled provider operations',
  { timeout: 10000 },
  async () => {
    const { app, state, origin } = await delayedCatalog('stall');
    try {
      const response = await fetch(origin + '/api/v1/movies/trending', {
        signal: AbortSignal.timeout(4000),
      });
      assert.equal(response.status, 503);
      assert.equal(
        c.apiErrorSchema.parse(await response.json()).error.code,
        'CATALOG_UNAVAILABLE',
      );
      assert.equal(state.started, 2);
      assert.equal(state.cancelled, 2);
      assert.equal(state.active, 0);
      assert.deepEqual(state.abortNames, ['TimeoutError', 'TimeoutError']);
    } finally {
      await app.close();
    }
  },
);

test(
  'real HTTP first provider failure cancels its stalled sibling while preserving rate-limit mapping',
  { timeout: 10000 },
  async () => {
    const { app, state, origin } = await delayedCatalog('failure');
    try {
      const response = await fetch(origin + '/api/v1/movies/trending', {
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 429);
      assert.equal(
        c.apiErrorSchema.parse(await response.json()).error.code,
        'RATE_LIMITED',
      );
      assert.equal(state.cancelled, 1);
      assert.equal(state.active, 0);
    } finally {
      await app.close();
    }
  },
);

test(
  'real HTTP client disconnect cancels and drains both active provider requests',
  { timeout: 10000 },
  async () => {
    const { app, state, origin } = await delayedCatalog('stall');
    const controller = new AbortController();
    try {
      const request = fetch(origin + '/api/v1/movies/trending', {
        signal: controller.signal,
      });
      const rejected = assert.rejects(request, { name: 'AbortError' });
      await state.bothStarted;
      controller.abort();
      await rejected;
      await state.allFinished;
      assert.equal(state.cancelled, 2);
      assert.equal(state.active, 0);
      // Distinguishes actual disconnect propagation from eventual scope-deadline cleanup.
      assert.deepEqual(state.abortNames, ['AbortError', 'AbortError']);
    } finally {
      controller.abort();
      await app.close();
    }
  },
);
