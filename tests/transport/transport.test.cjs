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
      await fs.mkdir(path.join(probe, 'states'));
      await fs.writeFile(
        path.join(probe, 'states/page.tsx'),
        `import { SectionState } from '@/features/movies/components/homepage-sections';
export default function States() { return <main><SectionState id="discover" title="Featured film" hero loading /><SectionState id="trending" title="Trending Now" loading /><SectionState id="films" title="Popular Films" loading /><SectionState id="genres" title="Browse by Genre" loading /></main>; }`,
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
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(webOrigin + '/transport-stage12-probe/states');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByRole('status')).toHaveCount(1);
        await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        for (const [selector, ratio] of [
          ['.skeleton-landscape', 16 / 9],
          ['.skeleton-poster', 2 / 3],
        ]) {
          const box = await page.locator(selector).first().boundingBox();
          assert.ok(
            box.width > 0 && Math.abs(box.width / box.height - ratio) < 0.03,
          );
        }
        await fs.mkdir(path.join(root, 'tmp/stage33'), { recursive: true });
        await page.screenshot({
          path: path.join(root, 'tmp/stage33', width + '-loading.png'),
          fullPage: true,
        });
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
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
  {
    timeout: process.env.FRAME_HOMEPAGE_ACCEPTANCE === 'true' ? 600000 : 90000,
  },
  async () => {
    const { createApp } = apiRequire('./dist/main');
    const { TmdbAdapter } = apiRequire('./dist/catalog/tmdb/tmdb.adapter');
    const { TmdbError } = apiRequire('./dist/catalog/tmdb/tmdb.error');
    const app = await createApp();
    const adapter = app.get(TmdbAdapter);
    let revision = 1;
    let failure = '';
    let slowDetail = false;
    let empty = false;
    let emptyGenres = false;
    let movieCount = 1;
    let acceptanceProfile = false;
    let missingBackdrop = false;
    let missingMetadata = false;
    let sourceDelay = 0;
    const observed = [];
    const provider = [];
    const privateToken = 'synthetic.homepage.private.token';
    const movie = (id = 42) => ({
      id,
      title: acceptanceProfile
        ? [
            'Synthetic midnight voyage',
            'A deliberately long synthetic title about a traveller crossing the edge of the known world',
            'Synthetic daylight',
            'Synthetic distant city',
            'Synthetic last horizon',
          ][(id - 42) % 5]
        : `Synthetic live ${revision}${id === 42 ? '' : ` slide ${id - 41}`}`,
      vote_count: 0,
      vote_average: 0,
      genre_ids: missingMetadata
        ? []
        : acceptanceProfile
          ? [id % 2 ? 35 : 18]
          : [18],
      release_date:
        !missingMetadata && acceptanceProfile && id % 3 ? '2020-01-01' : '',
      poster_path: acceptanceProfile ? `/synthetic${id}.jpg` : null,
      backdrop_path: missingBackdrop ? null : `/synthetic${id}.jpg`,
      overview: missingMetadata
        ? ''
        : acceptanceProfile
          ? 'Synthetic supplied overview with varied lengths. '.repeat(
              id % 3 ? 8 : 1,
            )
          : 'Synthetic summary',
    });
    const fake = new TmdbAdapter({
      config: { enabled: true, token: privateToken },
      fetch: async (url) => {
        provider.push(url.pathname);
        if (sourceDelay)
          await new Promise((resolve) => setTimeout(resolve, sourceDelay));
        if (
          failure === 'all' ||
          (failure === 'trending' && url.pathname.includes('/trending/')) ||
          (failure === 'popular' && url.pathname.includes('/popular')) ||
          (failure === 'genres' && url.pathname === '/3/genre/movie/list')
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
          return Response.json({
            genres: emptyGenres
              ? []
              : [
                  { id: 18, name: 'Drama' },
                  ...(acceptanceProfile ? [{ id: 35, name: 'Comedy' }] : []),
                ],
          });
        if (url.pathname === '/3/movie/42') {
          if (slowDetail)
            await new Promise((resolve) => setTimeout(resolve, 700));
          return Response.json({
            ...movie(),
            genres: [{ id: 18, name: 'Drama' }],
            runtime: missingMetadata ? null : 90,
            overview: missingMetadata
              ? ''
              : acceptanceProfile
                ? 'Synthetic enriched overview. '.repeat(20)
                : 'Synthetic enriched overview',
          });
        }
        return Response.json({
          page: 1,
          results: empty
            ? []
            : Array.from({ length: movieCount }, (_, index) =>
                movie(42 + index),
              ),
          total_pages: empty ? 0 : 1,
          total_results: empty ? 0 : movieCount,
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
      // Multi-film Hero: real production RSC composition, synthetic provider/artwork.
      movieCount = 9;
      await page.unroute('https://image.tmdb.org/**');
      const artwork = await Promise.all(
        [
          'charge',
          'spring',
          'sintel',
          'tears-of-steel',
          'cosmos-laundromat',
        ].map((name) =>
          fs.readFile(
            path.join(
              root,
              'apps/web/public/images/films',
              name + '-backdrop.webp',
            ),
          ),
        ),
      );
      const heldArtwork = new Map();
      const delayedArtwork = new Set([43, 45, 46]);
      const fulfillArtwork = (route, id) =>
        route.fulfill({
          contentType: 'image/webp',
          body: artwork[(id - 42) % 5],
        });
      await page.route('https://image.tmdb.org/**', (route) => {
        const id = Number(
          route
            .request()
            .url()
            .match(/synthetic(\d+)/)?.[1] ?? 42,
        );
        if (id === 44) return route.abort();
        if (delayedArtwork.has(id)) {
          heldArtwork.set(id, route);
          return;
        }
        return fulfillArtwork(route, id);
      });
      const releaseArtwork = async (id) => {
        await expect.poll(() => heldArtwork.has(id)).toBe(true);
        delayedArtwork.delete(id);
        await fulfillArtwork(heldArtwork.get(id), id);
        heldArtwork.delete(id);
      };
      const protocol = await page.context().newCDPSession(page);
      await protocol.send('Network.enable');
      const imageRequests = [];
      protocol.on('Network.requestWillBeSent', (event) => {
        if (/synthetic4[2-6]\.jpg/.test(event.request.url))
          imageRequests.push({
            url: event.request.url,
            priority: event.request.initialPriority,
          });
      });
      const catalogBeforeCarousel = observed.length;
      await page.reload({ waitUntil: 'domcontentloaded' });
      const hero = page.getByRole('region', {
        name: 'Featured films',
        exact: true,
      });
      await expect(hero).toBeVisible();
      await hero
        .getByRole('button', { name: /^Show featured film 2 of/ })
        .focus();
      await page.keyboard.press('Shift'); // Protect the initial network/visual checks with keyboard interaction.
      await hero.hover();
      await expect(hero.locator('img')).toHaveCount(2);
      assert.equal(new Set(imageRequests.map((item) => item.url)).size, 2);
      assert.equal(observed.length - catalogBeforeCarousel, 4);
      assert.equal(
        observed
          .slice(catalogBeforeCarousel)
          .filter((url) => url.startsWith('/api/v1/movies/trending')).length,
        1,
      );
      const metadataAtCarousel = observed.length;
      assert.ok(
        imageRequests.find((item) => item.url.includes('synthetic42.jpg'))
          ?.priority === 'High',
      );
      await expect(
        page.locator('link[rel="preload"][as="image"][href*="synthetic"]'),
      ).toHaveCount(1);
      assert.equal(
        await hero
          .locator('.hero-frame')
          .first()
          .evaluate((element) => getComputedStyle(element).transitionDuration),
        '0.7s',
      );
      await hero.evaluate((element) =>
        element.addEventListener('transitionend', (event) => {
          if (
            event.target.classList.contains('hero-frame') &&
            event.propertyName === 'opacity'
          )
            element.dataset.transitionObserved = String(event.elapsedTime);
        }),
      );
      const selectHero = (index) =>
        hero.getByRole('button', {
          name: new RegExp(`^Show featured film ${index + 1} of`),
        });
      const nextHero = selectHero(1);
      await expect(
        hero.getByRole('button', { name: /^Show featured film/ }),
      ).toHaveCount(5);
      await expect(
        hero.getByRole('button', { name: /Previous|Next/ }),
      ).toHaveCount(0);
      await nextHero.focus();
      await page.keyboard.press('Enter');
      // A slow destination keeps the displayed title, CTA and active dot on film one.
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2',
      );
      await expect(selectHero(0)).toHaveAttribute('aria-current', 'true');
      await expect(hero.getByRole('link')).toHaveAttribute(
        'href',
        'https://www.themoviedb.org/movie/42',
      );
      await expect(hero.locator('.hero-frame-active img')).toHaveAttribute(
        'src',
        /synthetic42\.jpg/,
      );
      await releaseArtwork(43);
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 2',
      );
      await expect(nextHero).toBeFocused();
      await expect(hero.getByRole('link')).toHaveCount(1);
      await expect(hero.getByRole('link')).toHaveAttribute(
        'href',
        'https://www.themoviedb.org/movie/43',
      );
      await expect
        .poll(() =>
          hero
            .locator('.hero-frame-active')
            .evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe('1');
      await expect(hero).toHaveAttribute('data-transition-observed', '0.7');
      await fs.mkdir(path.join(root, 'tmp/stage34a'), { recursive: true });
      await page.screenshot({
        path: path.join(root, 'tmp/stage34a/desktop.png'),
        fullPage: true,
      });
      const beforeHeight = (await hero.boundingBox()).height;
      await selectHero(2).click();
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 3',
      );
      await expect(
        hero.locator('.hero-frame-active [data-image-unavailable]'),
      ).toBeVisible();
      assert.ok(Math.abs((await hero.boundingBox()).height - beforeHeight) < 1);
      await selectHero(3).click();
      await selectHero(4).click();
      await releaseArtwork(45); // superseded completion must not expose film four
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 3',
      );
      await expect(selectHero(2)).toHaveAttribute('aria-current', 'true');
      await releaseArtwork(46);
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 5',
      );
      await expect(selectHero(4)).toHaveAttribute('aria-current', 'true');
      for (const index of [0, 4, 1, 3, 0]) await selectHero(index).click();
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2',
      );
      await selectHero(4).focus();
      await page.keyboard.press('Tab');
      await expect(
        hero.getByRole('button', { name: 'Pause featured films' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        hero.getByRole('button', { name: 'Play featured films' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        hero.getByRole('button', { name: 'Pause featured films' }),
      ).toBeFocused();
      // Deterministic browser clock: no native autoplay timer is active while keyboard focus protects the Hero.
      const heroInterval = 5000;
      const autoplayClock = new Date();
      await page.clock.install({ time: autoplayClock });
      await page.clock.pauseAt(new Date(autoplayClock.getTime() + 100));
      let expectedHeroIndex = 0;
      const expectHeroIndex = () =>
        expect(hero.getByRole('heading', { level: 1 })).toHaveText(
          expectedHeroIndex === 0
            ? 'Synthetic live 2'
            : `Synthetic live 2 slide ${expectedHeroIndex + 1}`,
        );
      await page.clock.runFor(12000);
      await expectHeroIndex(); // Keyboard focus remains protected even with the pointer inside.
      await hero.click({ position: { x: 10, y: 110 } }); // Ordinary pointer activation releases keyboard protection, without forced blur.
      for (const target of [
        hero,
        hero.getByRole('heading', { level: 1 }),
        nextHero,
      ]) {
        await target.hover();
        await page.clock.runFor(heroInterval - 1);
        await expectHeroIndex();
        await page.clock.runFor(1);
        expectedHeroIndex = (expectedHeroIndex + 1) % 5;
        await expectHeroIndex();
      }
      await page.clock.runFor(heroInterval - 1000);
      const mouseDot = selectHero((expectedHeroIndex + 1) % 5);
      await mouseDot.click();
      expectedHeroIndex = (expectedHeroIndex + 1) % 5;
      await expectHeroIndex();
      await expect(mouseDot).toBeFocused();
      await page.clock.runFor(heroInterval - 1);
      await expectHeroIndex();
      await page.clock.runFor(1);
      expectedHeroIndex = (expectedHeroIndex + 1) % 5;
      await expectHeroIndex();
      await expect(mouseDot).toBeFocused(); // Mouse-created focus must not prevent autoplay.
      await page.clock.runFor(heroInterval - 1000);
      await selectHero(expectedHeroIndex).click(); // Active dot must not reset the countdown.
      await page.clock.runFor(999);
      await expectHeroIndex();
      await page.clock.runFor(1);
      expectedHeroIndex = (expectedHeroIndex + 1) % 5;
      await expectHeroIndex();
      await mouseDot.press('ArrowRight'); // Keyboard interaction now protects the same focused control.
      await page.clock.runFor(12000);
      await expectHeroIndex();
      await hero.getByRole('button', { name: 'Pause featured films' }).click();
      await page.clock.runFor(12000);
      await expectHeroIndex();
      await hero.getByRole('button', { name: 'Play featured films' }).click();
      await page.clock.runFor(heroInterval - 1);
      await expectHeroIndex();
      await page.clock.runFor(1);
      expectedHeroIndex = (expectedHeroIndex + 1) % 5;
      await expectHeroIndex();
      await hero.getByRole('button', { name: 'Pause featured films' }).click();
      await page.clock.resume();
      assert.equal(
        imageRequests.length,
        5,
        'visited artwork gets one attempt per film',
      );
      assert.equal(new Set(imageRequests.map(({ url }) => url)).size, 5);
      assert.equal(
        observed.length,
        metadataAtCarousel,
        'manual carousel moves must not request Catalog metadata',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await expect(
        hero.getByRole('button', { name: 'Play featured films' }),
      ).toBeVisible();
      assert.ok(
        await hero
          .locator('.hero-frame')
          .first()
          .evaluate(
            (element) =>
              parseFloat(getComputedStyle(element).transitionDuration) <= 0.001,
          ),
        'Reduced Motion transitions must be effectively motionless',
      );
      const metadataAfterReload = observed.length;
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        // One frame/scroll position for every rectangle after viewport changes.
        const { controls, content, dots, heroBox, playback } =
          await hero.evaluate((element) => {
            const box = (node) => {
              const rect = node.getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              };
            };
            return {
              controls: box(element.querySelector('.hero-carousel-controls')),
              content: box(element.querySelector('.hero-content:not([inert])')),
              dots: box(element.querySelector('.hero-pagination')),
              heroBox: box(element),
              playback: box(element.querySelector('.hero-playback')),
            };
          });
        assert.ok(
          controls.y >= content.y + content.height,
          `controls must not overlap content: ${JSON.stringify({ width, controls, content })}`,
        );
        assert.ok(
          dots.x >= controls.x &&
            Math.abs(
              playback.x + playback.width - (controls.x + controls.width),
            ) < 1 &&
            controls.x + controls.width <= width,
          `pagination and playback must align to the right container edge: ${JSON.stringify({ width, controls, dots, playback })}`,
        );
        assert.ok(
          controls.y + controls.height <= heroBox.y + heroBox.height,
          'controls stay inside Hero',
        );
        await selectHero(0).focus();
        await page.keyboard.press('Shift');
        assert.ok(
          await selectHero(0).evaluate(
            (element) =>
              element.matches(':focus-visible') &&
              getComputedStyle(element).outlineStyle !== 'none',
          ),
          'keyboard dot focus is visible',
        );
        await expect(hero.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(hero.getByRole('link')).toHaveCount(1);
        for (const button of await hero.getByRole('button').all()) {
          const box = await button.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
        }
      }
      await page.setViewportSize({ width: 393, height: 900 });
      await page.evaluate(() => scrollTo(0, 0));
      await protocol.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
      });
      const touch = async (type, x, y) =>
        protocol.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
      await touch('touchStart', 280, 170);
      await touch('touchMove', 80, 172);
      await touch('touchEnd', 80, 172);
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 2',
      );
      await page.screenshot({
        path: path.join(root, 'tmp/stage34a/mobile.png'),
        fullPage: true,
      });
      await touch('touchStart', 180, 230);
      await touch('touchMove', 184, 80);
      await touch('touchEnd', 184, 80);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
        'Synthetic live 2 slide 2',
      );
      assert.equal(
        observed.length,
        metadataAfterReload,
        'touch and responsive interaction must not request Catalog metadata',
      );
      console.log(
        JSON.stringify({
          heroInitialRequests: imageRequests.slice(0, 2),
          heroInitialPreloads: 1,
          carouselWidths: [320, 768, 1440],
          touchSwipe: 'verified',
          verticalScroll: 'verified',
        }),
      );
      await protocol.detach();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      movieCount = 1;
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
      emptyGenres = true;
      failure = '';
      await page.reload();
      await expect(page.locator('#genres:visible')).toContainText(
        'Genre filters are unavailable',
      );
      await expect(
        page.locator('#genres:visible').getByRole('button'),
      ).toHaveCount(0);
      empty = true;
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await expect(page.locator('#trending:visible')).toContainText(
          'No trending films',
        );
        await expect(page.locator('#films:visible')).toContainText(
          'No popular films',
        );
        await expect(page.locator('#genres:visible')).toContainText(
          'No movie previews',
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
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
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator('#trending:visible')).toContainText(
          'temporarily unavailable',
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await fs.mkdir(path.join(root, 'tmp/stage33'), { recursive: true });
        await page.screenshot({
          path: path.join(root, 'tmp/stage33', width + '-error.png'),
          fullPage: true,
        });
      }
      await expect(page.getByLabel('TMDB credits')).toBeVisible();
      assert.ok(
        !requests.some((url) => url.startsWith('https://api.themoviedb.org')),
      );
      assert.ok(!requests.some((url) => url.startsWith(apiOrigin)));
      assert.ok(
        !requests.some((value) => {
          const url = new URL(value);
          return /^\/api\/v1\/(?:movies|genres|people)(?:\/|$)/.test(
            url.pathname,
          );
        }),
        'browser must not request Catalog metadata, including same-origin routes',
      );
      assert.deepEqual(errors, []);
      assert.ok(provider.includes('/3/trending/movie/week'));
      if (process.env.FRAME_HOMEPAGE_ACCEPTANCE === 'true') {
        await require('../visual/homepage-acceptance.cjs')({
          browser,
          origin,
          observed,
          artwork,
          setScenario(options = {}) {
            acceptanceProfile = true;
            movieCount = options.count ?? 9;
            failure = options.failure ?? '';
            empty = options.empty ?? false;
            emptyGenres = options.emptyGenres ?? false;
            missingBackdrop = options.missingBackdrop ?? false;
            missingMetadata = options.missingMetadata ?? false;
            sourceDelay = options.delay ?? 0;
          },
        });
      }
    } finally {
      if (browser) await browser.close();
      if (server) await stop(server);
      await app.close();
    }
  },
);
