const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('node:util');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const {
  TmdbAdapter,
  TMDB_OPTIONS,
} = require('../dist/catalog/tmdb/tmdb.adapter');
const { TmdbModule } = require('../dist/catalog/tmdb/tmdb.module');
const { TmdbError } = require('../dist/catalog/tmdb/tmdb.error');
const { tmdbConfig } = require('../dist/catalog/tmdb/tmdb.config');
const { createApp } = require('../dist/main');

// Synthetic values only. No TMDB payload or credential is stored in this suite.
const token = 'synthetic.private-token';
const config = { enabled: true, token };
const movie = { id: 42, title: 'Synthetic film' };
const page = { page: 1, results: [movie], total_pages: 1, total_results: 1 };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
const category = (expected) => (error) => {
  assert.ok(error instanceof TmdbError);
  assert.equal(error.category, expected);
  for (const text of [String(error), inspect(error), JSON.stringify(error)]) {
    assert.ok(!text.includes(token));
    assert.ok(!text.includes('upstream-private'));
  }
  assert.equal(error.cause, undefined);
  return true;
};

test('TMDB configuration is opt-in, header-safe and sanitized', async () => {
  assert.deepEqual(tmdbConfig({}), { enabled: false });
  assert.deepEqual(
    tmdbConfig({ TMDB_ENABLED: 'false', TMDB_READ_ACCESS_TOKEN: 'bad\nvalue' }),
    { enabled: false },
  );
  for (const value of [
    undefined,
    '',
    ' ',
    'Bearer secret',
    'bad\r\nheader',
    '<placeholder>',
    'x'.repeat(4097),
  ])
    assert.throws(
      () => tmdbConfig({ TMDB_ENABLED: 'true', TMDB_READ_ACCESS_TOKEN: value }),
      category('CONFIGURATION'),
    );
  assert.throws(
    () => tmdbConfig({ TMDB_ENABLED: 'yes' }),
    category('CONFIGURATION'),
  );
  assert.deepEqual(
    tmdbConfig({ TMDB_ENABLED: 'true', TMDB_READ_ACCESS_TOKEN: token }),
    config,
  );
  const adapter = new TmdbAdapter({
    config: { enabled: false },
    fetch: () => assert.fail('network must not run'),
  });
  await assert.rejects(adapter.genres(), category('CONFIGURATION'));
  for (const timeoutMs of [0, -1, Infinity, NaN, 10001])
    assert.throws(
      () => new TmdbAdapter({ config, timeoutMs }),
      category('CONFIGURATION'),
    );
});

test('four operations select fixed HTTPS paths, encoded queries and bearer headers', async () => {
  const observed = [];
  const adapter = new TmdbAdapter({
    config,
    fetch: async (url, options) => {
      observed.push({ url, options });
      return json(
        url.pathname.includes('genre')
          ? { genres: [{ id: 18, name: 'Synthetic genre' }] }
          : url.pathname === '/3/movie/42'
            ? movie
            : page,
      );
    },
  });
  assert.deepEqual(await adapter.trending('day'), page);
  await adapter.trending('week', { language: 'fr-FR' });
  await adapter.popular({ language: 'pt-BR', page: 500 });
  await adapter.genres({ language: 'en' });
  assert.deepEqual(await adapter.details(42), movie);
  assert.deepEqual(
    observed.map(({ url }) => url.pathname),
    [
      '/3/trending/movie/day',
      '/3/trending/movie/week',
      '/3/movie/popular',
      '/3/genre/movie/list',
      '/3/movie/42',
    ],
  );
  assert.equal(observed[2].url.search, '?language=pt-BR&page=500');
  assert.equal(observed[1].url.searchParams.get('language'), 'fr-FR');
  for (const { url, options } of observed) {
    assert.equal(url.origin, 'https://api.themoviedb.org');
    assert.ok(!url.href.includes(token));
    assert.equal(url.searchParams.has('api_key'), false);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.ok(!inspect(adapter, { showHidden: true }).includes(token));
  assert.ok(!JSON.stringify(adapter).includes(token));
});

test('provider request validation rejects injection, invalid windows, IDs and pages before HTTP', async () => {
  const adapter = new TmdbAdapter({
    config,
    fetch: () => assert.fail('invalid request reached HTTP'),
  });
  for (const value of ['month', '../movie', '', null])
    assert.throws(() => adapter.trending(value), category('INVALID_REQUEST'));
  for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, '42', '../42'])
    assert.throws(() => adapter.details(value), category('INVALID_REQUEST'));
  for (const value of [0, -1, 1.5, 501, NaN, Infinity, '1'])
    assert.throws(
      () => adapter.popular({ page: value }),
      category('INVALID_REQUEST'),
    );
  for (const language of [
    'en-US&api_key=secret',
    'en US',
    'https://evil.example',
    '',
    'en\r\nAuthorization: secret',
  ])
    await assert.rejects(
      adapter.genres({ language }),
      category('INVALID_REQUEST'),
    );
});

test('minimal provider projections reject malformed JSON/shapes and mismatched identity', async () => {
  for (const body of [
    null,
    {},
    [],
    { ...page, results: null },
    { ...page, results: [{ id: -1, title: 'Invalid' }] },
    { ...page, total_pages: -1 },
  ]) {
    const adapter = new TmdbAdapter({ config, fetch: async () => json(body) });
    await assert.rejects(adapter.popular(), category('UNEXPECTED_RESPONSE'));
  }
  for (const response of [
    new Response('upstream-private ' + token, {
      headers: { 'content-type': 'application/json' },
    }),
    new Response('<html>upstream-private</html>', {
      headers: { 'content-type': 'text/html' },
    }),
    new Response(null, { headers: { 'content-type': 'application/json' } }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    }),
  ]) {
    const adapter = new TmdbAdapter({ config, fetch: async () => response });
    await assert.rejects(adapter.popular(), category('UNEXPECTED_RESPONSE'));
  }
  const adapter = (body) =>
    new TmdbAdapter({ config, fetch: async () => json(body) });
  await assert.rejects(
    adapter({ genres: [{ id: 1 }] }).genres(),
    category('UNEXPECTED_RESPONSE'),
  );
  await assert.rejects(
    adapter({ ...movie, id: 43 }).details(42),
    category('UNEXPECTED_RESPONSE'),
  );
  assert.deepEqual(
    await adapter({ ...movie, internal: token }).details(42),
    movie,
  );
  assert.deepEqual(await adapter({ genres: [] }).genres(), { genres: [] });
  assert.deepEqual(
    await adapter({
      ...page,
      results: [],
      total_pages: 0,
      total_results: 0,
    }).popular(),
    { ...page, results: [], total_pages: 0, total_results: 0 },
  );
});

test('HTTP failures and thrown transport diagnostics are categorized without credential exposure', async () => {
  for (const [status, expected] of [
    [401, 'AUTHENTICATION'],
    [403, 'AUTHENTICATION'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM'],
    [503, 'UPSTREAM'],
    [400, 'UNEXPECTED_RESPONSE'],
    [302, 'UNEXPECTED_RESPONSE'],
  ]) {
    const adapter = new TmdbAdapter({
      config,
      fetch: async () => json({ secret: token }, status),
    });
    await assert.rejects(adapter.genres(), category(expected));
  }
  const adapter = new TmdbAdapter({
    config,
    fetch: async () => {
      throw new Error('upstream-private ' + token);
    },
  });
  await assert.rejects(adapter.genres(), category('NETWORK'));
});

test('cancellation and deadline abort the injected transport without leaking abort reasons', async () => {
  const stalled = async (_url, { signal }) => {
    signal.throwIfAborted();
    await new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  const adapter = new TmdbAdapter({ config, timeoutMs: 30, fetch: stalled });
  await assert.rejects(adapter.genres(), category('TIMEOUT'));
  const controller = new AbortController();
  const pending = adapter.genres({ signal: controller.signal });
  controller.abort(new Error(token));
  await assert.rejects(pending, category('CANCELLED'));
  await assert.rejects(
    adapter.genres({ signal: controller.signal }),
    category('CANCELLED'),
  );
});

test(
  'native fetch against synthetic real HTTP bounds headers/body, rejects redirects and cancels sockets',
  { timeout: 10000 },
  async () => {
    let mode = 'ok';
    const server = createServer((req, res) => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      if (mode === 'headers') return;
      if (mode === 'redirect') {
        res.writeHead(302, { location: 'http://127.0.0.1:1/secret' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (mode === 'body') {
        res.write('{');
        return;
      }
      res.end(JSON.stringify(page));
    });
    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${server.address().port}`;
      // Test seam redirects only this injected transport to our local synthetic server.
      const adapter = new TmdbAdapter({
        config,
        timeoutMs: 150,
        fetch: (url, options) =>
          fetch(origin + url.pathname + url.search, options),
      });
      assert.deepEqual(await adapter.popular(), page);
      for (const stalled of ['headers', 'body']) {
        mode = stalled;
        await assert.rejects(adapter.popular(), category('TIMEOUT'));
      }
      mode = 'redirect';
      await assert.rejects(adapter.popular(), category('NETWORK'));
      mode = 'body';
      const controller = new AbortController();
      const pending = adapter.popular({ signal: controller.signal });
      setTimeout(() => controller.abort(token), 20);
      await assert.rejects(pending, category('CANCELLED'));
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test('Nest owns one provider; enabling without credentials fails startup safely', async () => {
  // Initialize only the provider module: no listener/DB failure may masquerade as config rejection.
  const startup = `
    const { createApp } = require('./dist/main');
    const { TmdbModule } = require('./dist/catalog/tmdb/tmdb.module');
    createApp(TmdbModule).then(async app => {
      try { await app.init(); } finally { await app.close(); }
    }).catch(() => { process.exitCode = 1; });
  `;
  const settings = {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: {
      ...process.env,
      TMDB_ENABLED: 'true',
      TMDB_READ_ACCESS_TOKEN: '',
      DATABASE_URL: undefined,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
    },
    encoding: 'utf8',
    timeout: 10000,
  };
  const child = spawnSync(process.execPath, ['-e', startup], settings);
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 1);
  assert.ok(!(child.stdout + child.stderr).includes(token));
  const configured = spawnSync(process.execPath, ['-e', startup], {
    ...settings,
    env: { ...settings.env, TMDB_READ_ACCESS_TOKEN: token },
  });
  assert.equal(configured.error, undefined);
  assert.equal(configured.signal, null);
  assert.equal(configured.status, 0); // A synthetic token suffices: startup makes no HTTP request.
  assert.ok(!(configured.stdout + configured.stderr).includes(token));
  const previous = process.env.TMDB_ENABLED;
  process.env.TMDB_ENABLED = 'false';
  let app;
  try {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    assert.equal(app.select(TmdbModule).get(TmdbAdapter), app.get(TmdbAdapter));
    assert.equal(app.get(TMDB_OPTIONS).config.enabled, false);
    const origin = await app.getUrl();
    for (const path of [
      '/api/v1/movies/popular',
      '/api/v1/movies/trending',
      '/api/v1/genres',
      '/api/v1/tmdb',
    ])
      assert.equal((await fetch(origin + path)).status, 404);
  } finally {
    await app?.close();
    if (previous === undefined) delete process.env.TMDB_ENABLED;
    else process.env.TMDB_ENABLED = previous;
  }
});
