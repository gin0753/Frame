const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { createApp } = require('../dist/main');
const { CatalogController } = require('../dist/catalog/catalog.controller');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { CatalogCoordinator } = require('../dist/catalog/catalog.coordinator');
const { catalogPolicy } = require('../dist/catalog/catalog.policy');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const c = require('@frame/contracts');
const movie = {
  id: 42,
  title: 'Synthetic resilience',
  vote_count: 0,
  genre_ids: [18],
};
const page = { page: 1, results: [movie], total_pages: 1, total_results: 1 };
const configuration = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
async function waitFor(predicate) {
  const end = performance.now() + 1500;
  while (!predicate()) {
    assert.ok(
      performance.now() < end,
      'Synthetic boundary did not reach expected state',
    );
    await tick();
  }
}
async function setup({ retentionEnabled = false, manual = false } = {}) {
  let now = 0;
  const coordinator = new CatalogCoordinator({
    ...catalogPolicy({}),
    retentionEnabled,
    now: () => now,
    ttlMs: {
      trending: 100,
      popular: 100,
      detail: 100,
      genres: 100,
      configuration: 1000,
    },
  });
  const state = {
    calls: [],
    pending: [],
    active: 0,
    aborted: 0,
    mode: 'healthy',
    target: '/3/movie/42',
  };
  const adapter = new TmdbAdapter({
    config: { enabled: true, token: 'synthetic.private-resilience' },
    fetch: (url, { signal }) =>
      new Promise((resolve, reject) => {
        state.calls.push(new URL(url));
        state.active++;
        let done = false;
        const finish = (aborted = false) => {
          if (done) return;
          done = true;
          state.active--;
          signal.removeEventListener('abort', abort);
          if (aborted) {
            state.aborted++;
            reject(new Error('INJECTED_PRIVATE_UPSTREAM'));
            return;
          }
          if (url.pathname === state.target && state.mode !== 'healthy') {
            if (state.mode === 'network') {
              reject(new Error('INJECTED_PRIVATE_UPSTREAM'));
              return;
            }
            if (state.mode === 'malformed') {
              resolve(Response.json({ private: 'INJECTED_PRIVATE_UPSTREAM' }));
              return;
            }
            resolve(
              Response.json(
                { private: 'INJECTED_PRIVATE_UPSTREAM' },
                {
                  status: Number(state.mode),
                  headers: { 'retry-after': '3600' },
                },
              ),
            );
            return;
          }
          const result =
            url.pathname === '/3/configuration'
              ? configuration
              : url.pathname === '/3/genre/movie/list'
                ? { genres: [{ id: 18, name: 'Drama' }] }
                : url.pathname === '/3/movie/42'
                  ? { ...movie, genres: [{ id: 18, name: 'Drama' }] }
                  : {
                      ...page,
                      page: Number(url.searchParams.get('page') ?? 1),
                      results:
                        Number(url.searchParams.get('page') ?? 1) === 1
                          ? [movie]
                          : [],
                    };
          resolve(Response.json(result));
        };
        const abort = () => finish(true);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else if (manual) state.pending.push(finish);
        else finish();
      }),
  });
  const service = new CatalogService(adapter, coordinator);
  class SyntheticCatalogModule {}
  Module({
    controllers: [CatalogController],
    providers: [
      { provide: CatalogService, useValue: service },
      { provide: CatalogCoordinator, useValue: coordinator },
    ],
  })(SyntheticCatalogModule);
  const app = await createApp(SyntheticCatalogModule);
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  return {
    app,
    coordinator,
    service,
    state,
    setNow: (value) => {
      now = value;
    },
    release: () => state.pending.splice(0).forEach((finish) => finish()),
    get: (path, signal = AbortSignal.timeout(3000)) =>
      fetch(origin + '/api/v1' + path, { signal }),
  };
}

test('real HTTP identical reads coalesce and distinct movies share only image configuration; completed data is not retained by default', async () => {
  const context = await setup({ manual: true });
  const { app, state, service, coordinator, get, release } = context;
  try {
    const responses = Promise.all(
      Array.from({ length: 4 }, () => get('/movies/trending')),
    );
    await waitFor(
      () => service.diagnostics().requests === 4 && state.calls.length === 2,
    );
    release();
    for (const response of await responses) {
      assert.equal(response.status, 200);
      c.moviePageSchema.parse(await response.json());
    }
    assert.equal(state.calls.length, 2);
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    const next = Promise.all([
      get('/movies/trending?timeWindow=day'),
      get('/movies/popular?page=2'),
      get('/movies/42'),
    ]);
    await waitFor(
      () => service.diagnostics().requests === 7 && state.calls.length === 6,
    );
    release();
    for (const response of await next) assert.equal(response.status, 200);
    assert.equal(
      state.calls.filter((url) => url.pathname === '/3/configuration').length,
      2,
    );
    const last = get('/movies/trending');
    await waitFor(() => state.calls.length === 8);
    release();
    assert.equal((await last).status, 200);
    await waitFor(() => coordinator.diagnostics().activeFlights === 0);
    assert.equal(state.active, 0);
    assert.equal(coordinator.diagnostics().activeConsumers, 0);
    assert.ok(coordinator.diagnostics().coalesced >= 5);
    const diagnostics = service.diagnostics();
    assert.equal(diagnostics.provider.requests, 8);
    assert.ok(diagnostics.totalDurationMs >= 0);
    assert.ok(
      !/synthetic.private|INJECTED_PRIVATE|Authorization|https?:/.test(
        JSON.stringify(diagnostics),
      ),
    );
  } finally {
    await app.close();
  }
});

test('real HTTP one disconnected caller does not cancel another; all disconnected callers cancel shared work and a later request starts fresh', async () => {
  const { app, state, service, coordinator, get, release } = await setup({
    manual: true,
  });
  try {
    const first = new AbortController();
    const second = new AbortController();
    const one = get('/movies/trending', first.signal);
    const rejected = assert.rejects(one, { name: 'AbortError' });
    const two = get('/movies/trending', second.signal);
    await waitFor(
      () => service.diagnostics().requests === 2 && state.calls.length === 2,
    );
    first.abort();
    await rejected;
    await waitFor(() => coordinator.diagnostics().cancelled >= 1);
    assert.equal(state.aborted, 0);
    release();
    assert.equal((await two).status, 200);
    const aborters = [new AbortController(), new AbortController()];
    const pending = aborters.map((controller) =>
      get('/movies/trending', controller.signal),
    );
    const failures = pending.map((promise) =>
      assert.rejects(promise, { name: 'AbortError' }),
    );
    await waitFor(
      () => service.diagnostics().requests === 4 && state.calls.length === 4,
    );
    aborters.forEach((controller) => controller.abort());
    await Promise.all(failures);
    await waitFor(() => coordinator.diagnostics().activeFlights === 0);
    assert.equal(state.aborted, 2);
    assert.equal(state.active, 0);
    const next = get('/movies/trending');
    await waitFor(() => state.calls.length === 6);
    release();
    assert.equal((await next).status, 200);
  } finally {
    await app.close();
  }
});

test('real HTTP synthetic retained cache hits/expiry reuse validated configuration without stale fallback', async () => {
  const { app, state, coordinator, get, setNow } = await setup({
    retentionEnabled: true,
  });
  try {
    let response = await get('/movies/trending');
    assert.equal(response.status, 200);
    const original = await response.json();
    response = await get('/movies/trending');
    assert.deepEqual(await response.json(), original);
    assert.equal(state.calls.length, 2);
    setNow(100);
    response = await get('/movies/trending');
    assert.equal(response.status, 200);
    assert.equal(state.calls.length, 3);
    assert.equal(
      state.calls.filter((url) => url.pathname === '/3/configuration').length,
      1,
    );
    setNow(200);
    state.target = '/3/trending/movie/week';
    state.mode = '500';
    response = await get('/movies/trending');
    assert.equal(response.status, 502);
    assert.equal(
      c.apiErrorSchema.parse(await response.json()).error.code,
      'CATALOG_UNAVAILABLE',
    );
    coordinator.clear();
    state.target = '/3/configuration';
    state.mode = '404';
    response = await get('/movies/42');
    assert.equal(response.status, 502); // Configuration failure is not movie absence.
  } finally {
    await app.close();
  }
});

test('real HTTP provider failures remain safe, are not retried or cached, and invalid requests bypass coordination', async () => {
  const { app, state, coordinator, get } = await setup({
    retentionEnabled: true,
  });
  try {
    for (const [mode, target, status, code] of [
      ['401', '/3/movie/42', 503, 'CATALOG_UNAVAILABLE'],
      ['403', '/3/movie/42', 503, 'CATALOG_UNAVAILABLE'],
      ['404', '/3/movie/42', 404, 'NOT_FOUND'],
      ['429', '/3/movie/42', 429, 'RATE_LIMITED'],
      ['500', '/3/movie/42', 502, 'CATALOG_UNAVAILABLE'],
      ['network', '/3/movie/42', 502, 'CATALOG_UNAVAILABLE'],
      ['malformed', '/3/movie/42', 502, 'CATALOG_UNAVAILABLE'],
      ['404', '/3/configuration', 502, 'CATALOG_UNAVAILABLE'],
    ]) {
      coordinator.clear();
      state.mode = mode;
      state.target = target;
      const before = state.calls.length;
      const response = await get('/movies/42');
      assert.equal(response.status, status);
      const raw = await response.text();
      const body = c.apiErrorSchema.parse(JSON.parse(raw));
      assert.equal(body.error.code, code);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-request-id'), body.error.requestId);
      assert.ok(
        !/INJECTED_PRIVATE|synthetic.private|Authorization|stack/.test(raw),
      );
      assert.equal(
        state.calls.slice(before).filter((url) => url.pathname === target)
          .length,
        1,
      ); // Including Retry-After=3600: fail, never wait/retry.
      await waitFor(() => coordinator.diagnostics().activeFlights === 0);
    }
    const before = state.calls.length;
    for (const path of [
      '/movies/trending?page=2',
      '/movies/popular?page=501',
      '/movies/2147483648',
      '/genres?language=fr',
    ]) {
      const response = await get(path);
      assert.equal(response.status, 400);
      assert.equal(
        c.apiErrorSchema.parse(await response.json()).error.code,
        'VALIDATION_ERROR',
      );
    }
    assert.equal(state.calls.length, before);
  } finally {
    await app.close();
  }
});
