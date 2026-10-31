const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const { healthResponseSchema, apiErrorSchema } = apiRequire('@frame/contracts');
const nextCli = webRequire.resolve('next/dist/bin/next');
const children = new Set();
const output = [];
async function port() {
  const s = net.createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
function child(file, args = [], env = {}, ipc = false) {
  const c = ipc
    ? fork(file, args, {
        cwd: root,
        env: { ...process.env, ...env },
        silent: true,
      })
    : spawn(
        process.execPath,
        [
          file,
          ...(file.endsWith('/next') || file.endsWith('\\next')
            ? [...args, '--experimental-next-config-strip-types']
            : args),
        ],
        {
          cwd: root,
          env: { ...process.env, ...env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
  children.add(c);
  c.stdout?.on('data', (b) => output.push(String(b)));
  c.stderr?.on('data', (b) => output.push(String(b)));
  c.on('exit', () => children.delete(c));
  return c;
}
async function stop(c) {
  if (c.exitCode !== null || c.signalCode) return;
  const exited = once(c, 'exit');
  if (c.connected) c.send('close');
  else c.kill();
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => {
        c.kill();
        reject(new Error('process shutdown deadline'));
      }, 5000).unref(),
    ),
  ]);
}
async function ready(url, c) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (c.exitCode !== null)
      throw new Error('server exited ' + output.slice(-8).join(''));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      await response.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('readiness deadline ' + output.slice(-8).join(''));
}
async function json(url, status = 200) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, status);
  const body = await r.json();
  if (body.error) {
    apiErrorSchema.parse(body);
    assert.deepEqual(Object.keys(body), ['error']);
    assert.match(body.error.requestId, /^req_[0-9a-f-]+$/);
    assert.equal(body.error.requestId, r.headers.get('x-request-id'));
    assert.equal(
      body.error.code,
      status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
    );
    return { statusCode: status, message: body.error.message };
  }
  // Probe failures are deliberately a Next-only 502 shape; successful health is shared.
  return status === 200 ? healthResponseSchema.parse(body) : body;
}
const health = { status: 'ok', service: 'frame-api' };
test(
  'real Nest + Next development and production browser/server transport',
  { timeout: 240000 },
  async () => {
    const apiPort = await port(),
      webPort = await port();
    const apiOrigin = `http://127.0.0.1:${apiPort}`,
      webOrigin = `http://127.0.0.1:${webPort}`;
    const probe = path.join(root, 'apps/web/src/app/transport-stage12-probe');
    const observations = [];
    let browser, api, web;
    let ownsProbe = false;
    try {
      await fs.mkdir(probe);
      ownsProbe = true;
      await fs.copyFile(
        path.join(__dirname, 'probe-route.txt'),
        path.join(probe, 'route.ts'),
      );
      await fs.mkdir(path.join(probe, 'fixtures'));
      await fs.copyFile(
        path.join(__dirname, '../visual/fixture-homepage.txt'),
        path.join(probe, 'fixtures/page.tsx'),
      );
      api = child(
        path.join(__dirname, 'api-fixture.cjs'),
        [],
        { PORT: String(apiPort) },
        true,
      );
      api.on('message', (m) => observations.push(m));
      await ready(apiOrigin + '/api/v1/health', api);
      assert.deepEqual(await json(apiOrigin + '/api/v1/health'), health);
      const env = {
        FRAME_LOCAL_API_PROXY: 'true',
        FRAME_API_ORIGIN: apiOrigin,
      };
      web = child(
        nextCli,
        [
          'dev',
          'apps/web',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(webPort),
        ],
        env,
      );
      await ready(webOrigin, web);
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
      });
      const page = await browser.newPage();
      await page.goto(webOrigin);
      const result = await page.evaluate(async () => {
        const r = await fetch('/api/v1/health?transport=browser&encoded=a%20b');
        return {
          url: r.url,
          status: r.status,
          body: await r.json(),
          cache: r.headers.get('cache-control'),
        };
      });
      assert.equal(
        result.url,
        webOrigin + '/api/v1/health?transport=browser&encoded=a%20b',
      );
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, health);
      assert.equal(result.cache, 'no-store');
      assert.deepEqual(
        await json(webOrigin + '/transport-stage12-probe'),
        health,
      );
      assert(
        observations.some(
          (m) => m.url === '/api/v1/health?transport=browser&encoded=a%20b',
        ),
      );
      const spoof = await fetch(webOrigin + '/api/v1/health', {
        headers: {
          origin: 'https://evil.example',
          'x-forwarded-for': '203.0.113.9',
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'https',
        },
      });
      assert.equal(spoof.status, 200);
      assert.equal(spoof.headers.get('access-control-allow-origin'), null);
      const last = observations.at(-1);
      assert.equal(last.ip, '127.0.0.1');
      assert.equal(last.protocol, 'http');
      assert.equal(last.host, `127.0.0.1:${apiPort}`);
      assert.equal(last.origin, 'https://evil.example');
      assert.deepEqual(
        await json(webOrigin + '/api/v1/transport-failure', 500),
        { statusCode: 500, message: 'Internal Server Error' },
      );
      assert.deepEqual(
        await json(webOrigin + '/api/v1/nested/missing?x=1', 404),
        { statusCode: 404, message: 'Not Found' },
      );
      for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(webOrigin + '/transport-stage12-probe/fixtures');
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await expect(page.getByRole('banner')).toBeVisible();
      }
      await page.setViewportSize({ width: 393, height: 900 });
      await page.goto(webOrigin + '/transport-stage12-probe/fixtures');
      const menu = page.getByRole('button', { name: 'Open navigation' });
      await menu.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(menu).toBeFocused();
      await page.getByRole('button', { name: 'Sci-fi', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Sci-fi', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('region', { name: 'Genre film results' }),
      ).toBeVisible();
      await page.getByText('View selected films', { exact: false }).click();
      await expect(
        page.getByRole('region', { name: 'Genre film results' }),
      ).toBeHidden();
      await page.getByText('View selected films', { exact: false }).click();
      await expect(
        page.getByRole('region', { name: 'Genre film results' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Show all films' }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(webOrigin + '/transport-stage12-probe/fixtures');
      await expect(
        page
          .getByRole('region', { name: 'Charge', exact: true })
          .getByRole('link', { name: 'Explore Charge on Blender Studio' }),
      ).toHaveAttribute('href', /studio.blender.org/);
      const next = page.getByRole('button', {
        name: 'Next Trending Now',
        exact: true,
      });
      await next.click();
      await expect(
        page.getByRole('button', {
          name: 'Previous Trending Now',
          exact: true,
        }),
      ).toBeEnabled();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(webOrigin);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await stop(api);
      assert.equal((await fetch(webOrigin + '/api/v1/health')).status, 500);
      assert.deepEqual(
        await json(webOrigin + '/transport-stage12-probe', 502),
        { message: 'API unavailable' },
      );
      // A real non-JSON upstream and a stalled upstream exercise server fetch failures.
      for (const mode of [
        'non-json',
        'malformed-json',
        'http-failure',
        'body-timeout',
        'timeout',
      ]) {
        const server = require('node:http').createServer((req, res) => {
          if (mode === 'non-json') res.end('PRIVATE upstream HTML');
          if (mode === 'malformed-json') {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                status: 'ok',
                service: 'wrong',
                password: 'PRIVATE upstream value',
              }),
            );
          }
          if (mode === 'http-failure') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'frame-api' }));
          }
          if (mode === 'body-timeout') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write('{"status":');
          }
        });
        await new Promise((r) => server.listen(apiPort, '127.0.0.1', r));
        try {
          const before = Date.now();
          assert.deepEqual(
            await json(webOrigin + '/transport-stage12-probe', 502),
            { message: 'API unavailable' },
          );
          if (mode === 'timeout' || mode === 'body-timeout') {
            assert(Date.now() - before < 8000);
          }
          if (mode === 'timeout') {
            assert.equal(
              (
                await fetch(webOrigin + '/api/v1/health', {
                  signal: AbortSignal.timeout(8000),
                })
              ).status,
              500,
            );
          }
        } finally {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
        }
      }
      await stop(web);
      await fs.rm(probe, { recursive: true });
      const generated = path.resolve(root, 'apps/web/.next/dev/types');
      assert(generated.startsWith(root + path.sep));
      await fs.rm(generated, { recursive: true, force: true });
      api = child(
        path.join(__dirname, 'api-fixture.cjs'),
        [],
        { PORT: String(apiPort) },
        true,
      );
      await ready(apiOrigin + '/api/v1/health', api);
      const build = child(nextCli, ['build', 'apps/web'], env);
      assert.equal(
        (await once(build, 'exit'))[0],
        0,
        output.slice(-12).join(''),
      );
      web = child(
        nextCli,
        [
          'start',
          'apps/web',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(webPort),
        ],
        env,
      );
      await ready(webOrigin, web);
      await page.goto(webOrigin);
      assert.deepEqual(
        await page.evaluate(() =>
          fetch('/api/v1/health').then((r) => r.json()),
        ),
        health,
      );
      assert.equal(
        (await fetch(webOrigin + '/transport-stage12-probe')).status,
        404,
      );
      const assets = await fs.readdir(
        path.join(root, 'apps/web/.next/static'),
        { recursive: true },
      );
      for (const asset of assets.filter((x) => /\.(js|json)$/.test(x))) {
        assert(
          !(
            await fs.readFile(
              path.join(root, 'apps/web/.next/static', asset),
              'utf8',
            )
          ).includes(apiOrigin),
          `origin leaked: ${asset}`,
        );
      }
      assert(!(await (await fetch(webOrigin)).text()).includes(apiOrigin));
      await stop(web);
      web = child(
        nextCli,
        [
          'dev',
          'apps/web',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(webPort),
        ],
        { ...env, FRAME_LOCAL_API_PROXY: 'false' },
      );
      await ready(webOrigin, web);
      assert.equal((await fetch(webOrigin + '/api/v1/health')).status, 404);
      console.log(
        JSON.stringify({
          direct: health,
          browser: result,
          server: health,
          observedSpoof: last,
          productionBrowser: 'verified',
          productionServer: 'not executed: probe excluded',
          disabledRewrite: 404,
          homepageWidths: 7,
        }),
      );
    } finally {
      await browser?.close();
      for (const c of [...children]) await stop(c);
      if (ownsProbe) await fs.rm(probe, { recursive: true, force: true });
      await fs.mkdir(path.join(root, 'tmp/stage12'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'tmp/stage12/transport.log'),
        output.join(''),
      );
    }
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  test(`isolated ${signal} shutdown`, { timeout: 15000 }, async () => {
    const p = await port();
    const c = child(
      path.join(__dirname, 'signal-fixture.cjs'),
      [],
      { PORT: String(p) },
      true,
    );
    try {
      await once(c, 'message');
      const exited = once(c, 'exit');
      if (process.platform === 'win32') c.send(signal);
      else c.kill(signal);
      await exited;
      await assert.rejects(fetch(`http://127.0.0.1:${p}/api/v1/health`));
      console.log(
        `${signal}: listener released; ${process.platform === 'win32' ? 'Windows listener emission (not POSIX delivery)' : 'real signal'}`,
      );
    } finally {
      await stop(c);
    }
  });

test(
  'production Homepage consumes real Nest Catalog with isolated source failures and no retained responses',
  { timeout: 90000 },
  async () => {
    const { createApp } = apiRequire('./dist/main');
    const { TmdbAdapter } = apiRequire('./dist/catalog/tmdb/tmdb.adapter');
    const { TmdbError } = apiRequire('./dist/catalog/tmdb/tmdb.error');
    const app = await createApp();
    const adapter = app.get(TmdbAdapter);
    let revision = 1;
    let failure = '';
    let slowDetail = false;
    const observed = [];
    const provider = [];
    const privateToken = 'synthetic.homepage.private.token';
    const movie = () => ({
      id: 42,
      title: `Synthetic live ${revision}`,
      vote_count: 0,
      vote_average: 0,
      genre_ids: [18],
      release_date: '',
      poster_path: null,
      backdrop_path: '/synthetic.jpg',
      overview: 'Synthetic summary',
    });
    const fake = new TmdbAdapter({
      config: { enabled: true, token: privateToken },
      fetch: async (url) => {
        provider.push(url.pathname);
        if (
          failure === 'all' ||
          (failure === 'trending' && url.pathname.includes('/trending/'))
        )
          throw new TmdbError('NETWORK');
        if (url.pathname === '/3/configuration')
          return Response.json({
            images: {
              secure_base_url: 'https://image.tmdb.org/t/p/',
              poster_sizes: ['w500'],
              backdrop_sizes: ['w1280'],
            },
          });
        if (url.pathname === '/3/genre/movie/list')
          return Response.json({ genres: [{ id: 18, name: 'Drama' }] });
        if (url.pathname === '/3/movie/42') {
          if (slowDetail)
            await new Promise((resolve) => setTimeout(resolve, 700));
          return Response.json({
            ...movie(),
            genres: [{ id: 18, name: 'Drama' }],
            runtime: 90,
            overview: 'Synthetic enriched overview',
          });
        }
        return Response.json({
          page: 1,
          results: [movie()],
          total_pages: 1,
          total_results: 1,
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
    app.use((req, _res, next) => {
      observed.push(req.url);
      next();
    });
    let server;
    let browser;
    try {
      await app.listen(0, '127.0.0.1');
      const apiOrigin = await app.getUrl();
      const webPort = await port();
      const origin = `http://127.0.0.1:${webPort}`;
      server = child(
        nextCli,
        [
          'start',
          'apps/web',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(webPort),
        ],
        { FRAME_API_ORIGIN: apiOrigin, FRAME_LOCAL_API_PROXY: 'false' },
      );
      await ready(origin, server);
      observed.length = 0;
      provider.length = 0;
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
      });
      const page = await browser.newPage();
      const requests = [];
      const errors = [];
      page.on('request', (req) => requests.push(req.url()));
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://image.tmdb.org/**', (route) => route.abort());
      await page.goto(origin);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Synthetic live 1' }),
      ).toBeVisible();
      await expect(page.getByText('Synthetic enriched overview')).toBeVisible();
      await expect(page.locator('#trending:visible')).toContainText(
        'Synthetic live 1',
      );
      await expect(page.locator('#films:visible')).toContainText(
        'Synthetic live 1',
      );
      assert.equal(
        observed.filter((url) => url.startsWith('/api/v1/movies/trending'))
          .length,
        1,
      );
      assert.equal(
        observed.filter((url) => url.startsWith('/api/v1/movies/42')).length,
        1,
      );
      assert.ok(
        observed.includes('/api/v1/movies/trending?timeWindow=week&page=1'),
      );
      assert.ok(observed.includes('/api/v1/movies/popular?page=1'));
      assert.ok(observed.includes('/api/v1/genres'));
      revision = 2;
      await page.reload();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Synthetic live 2' }),
      ).toBeVisible();
      assert.equal(
        observed.filter((url) => url.startsWith('/api/v1/movies/trending'))
          .length,
        2,
      );
      slowDetail = true;
      const response = await fetch(origin, {
        headers: { 'user-agent': 'Mozilla/5.0' },
      });
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      const reader = response.body.getReader();
      let streamed = '';
      let railsBeforeHero = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        streamed += new TextDecoder().decode(value);
        if (
          streamed.includes('Trending this week on TMDB.') &&
          !streamed.includes('Synthetic enriched overview')
        )
          railsBeforeHero = true;
      }
      assert.ok(
        railsBeforeHero,
        'rail content must stream before delayed Hero enrichment',
      );
      assert.ok(!streamed.includes(privateToken));
      assert.ok(!streamed.includes(apiOrigin));
      slowDetail = false;
      failure = 'trending';
      await page.reload();
      await expect(page.locator('#discover:visible')).toContainText(
        'Featured film unavailable',
      );
      await expect(page.locator('#trending:visible')).toContainText(
        'temporarily unavailable',
      );
      await expect(page.locator('#films:visible')).toContainText(
        'Synthetic live 2',
      );
      await expect(page.locator('#genres:visible')).toContainText(
        'Some movie sources are unavailable',
      );
      failure = 'all';
      await page.reload();
      await expect(page.locator('#films:visible')).toContainText(
        'temporarily unavailable',
      );
      await expect(page.locator('#collections')).toContainText(
        'Limitless worlds.',
      );
      await expect(page.locator('#acclaimed')).toContainText(
        'Festival & Award Recognition',
      );
      await expect(page.getByLabel('TMDB credits')).toBeVisible();
      assert.ok(
        !requests.some((url) => url.startsWith('https://api.themoviedb.org')),
      );
      assert.ok(!requests.some((url) => url.startsWith(apiOrigin)));
      assert.deepEqual(errors, []);
      assert.ok(provider.includes('/3/trending/movie/week'));
    } finally {
      if (browser) await browser.close();
      if (server) await stop(server);
      await app.close();
    }
  },
);
