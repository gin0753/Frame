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
      await fetch(url, { signal: AbortSignal.timeout(800) });
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
    assert.deepEqual(Object.keys(body), ['error']);
    assert.match(body.error.requestId, /^req_[0-9a-f-]+$/);
    assert.equal(body.error.requestId, r.headers.get('x-request-id'));
    assert.equal(
      body.error.code,
      status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
    );
    return { statusCode: status, message: body.error.message };
  }
  return body;
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
        await page.goto(webOrigin);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await expect(page.getByRole('banner')).toBeVisible();
      }
      await page.setViewportSize({ width: 393, height: 900 });
      await page.goto(webOrigin);
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
      await page.goto(webOrigin);
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
      for (const mode of ['non-json', 'timeout']) {
        const server = require('node:http').createServer((req, res) => {
          if (mode === 'non-json') res.end('PRIVATE upstream HTML');
        });
        await new Promise((r) => server.listen(apiPort, '127.0.0.1', r));
        try {
          const before = Date.now();
          assert.deepEqual(
            await json(webOrigin + '/transport-stage12-probe', 502),
            { message: 'API unavailable' },
          );
          if (mode === 'timeout') {
            assert(Date.now() - before < 8000);
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
