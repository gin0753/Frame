// Stage 4.6.1 only. Run development against an existing local Next server;
// production mode starts the already-built application on an isolated port.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const crypto = require('node:crypto');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const evidence = path.join(root, 'tmp/ambient-spike');
const production = process.env.FRAME_AMBIENT_QA === 'production';
const routes = ['/dev/ambient', '/dev/ambient/custom', '/dev/ambient/library'];

async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}

async function launch() {
  return chromium.launch({
    headless: true,
    executablePath:
      process.env.FRAME_CHROMIUM_EXECUTABLE ||
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}
test(
  production
    ? 'ambient production routes and bundles are excluded'
    : 'single ambient development route and removed subroutes',
  { timeout: 300000 },
  async () => {
    await fs.mkdir(evidence, { recursive: true });
    const report = {
      mode: production ? 'production' : 'development',
      cases: [],
      errors: [],
      measurements: [],
      rendering:
        'Chromium SwiftShader software WebGL; not physical-device performance',
    };
    let server, browser;
    try {
      const vendor = path.join(
        root,
        'apps/web/src/components/visual/ambient-vendor',
      );
      const hashes = JSON.parse(
        await fs.readFile(path.join(vendor, 'shader-hashes.json'), 'utf8'),
      );
      for (const name of ['DarkVeil', 'Aurora']) {
        const source = await fs.readFile(
          path.join(vendor, name + '.tsx'),
          'utf8',
        );
        const shaders = Object.fromEntries(
          [
            ...source.matchAll(
              /const (QUAD_VERTEX|FIELD|COMPOSITE|VERTEX|FRAGMENT) = `([\s\S]*?)`;/g,
            ),
          ].map(([, key, shader]) => [
            key,
            crypto.createHash('sha256').update(shader).digest('hex'),
          ]),
        );
        assert.deepEqual(
          shaders,
          hashes[name],
          name + ' shader algorithms must match pinned upstream',
        );
      }
      let origin =
        process.env.FRAME_AMBIENT_DEV_ORIGIN || 'http://127.0.0.1:3000';
      if (production) {
        const listener = net.createServer();
        listener.listen(0, '127.0.0.1');
        await once(listener, 'listening');
        const port = listener.address().port;
        await new Promise((resolve) => listener.close(resolve));
        origin = `http://127.0.0.1:${port}`;
        server = spawn(
          process.execPath,
          [
            webRequire.resolve('next/dist/bin/next'),
            'start',
            'apps/web',
            '--hostname',
            '127.0.0.1',
            '--port',
            String(port),
            '--experimental-next-config-strip-types',
          ],
          { cwd: root, stdio: 'pipe' },
        );
        let logs = '';
        server.stdout.on('data', (b) => {
          logs += b;
        });
        server.stderr.on('data', (b) => {
          logs += b;
        });
        for (let i = 0; i < 100; i++) {
          try {
            await fetch(origin);
            break;
          } catch {
            if (server.exitCode !== null) throw new Error(logs);
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        for (const route of routes)
          for (const suffix of ['', '/']) {
            const response = await fetch(origin + route + suffix);
            assert.equal(response.status, 404, route + suffix);
            assert.ok(!(await response.text()).includes('AMBIENT STUDY'));
            report.cases.push({ route: route + suffix, status: 404 });
          }
        const manifest = JSON.parse(
          await fs.readFile(
            path.join(root, 'apps/web/.next/server/app-paths-manifest.json'),
            'utf8',
          ),
        );
        assert.ok(
          !Object.keys(manifest).some((key) => key.includes('/dev/ambient')),
        );
        for (const name of [
          'routes-manifest.json',
          'app-path-routes-manifest.json',
          'prerender-manifest.json',
        ]) {
          assert.ok(
            !(
              await fs.readFile(path.join(root, 'apps/web/.next', name), 'utf8')
            ).includes('/dev/ambient'),
            name,
          );
        }
        let scanned = 0;
        for (const file of await files(
          path.join(root, 'apps/web/.next/static'),
        ))
          if (/\.(js|css)$/.test(file)) {
            assert.ok(
              !/17683\.71|AMBIENT STUDY|ambient-playground|ambient-gallery|gallery-vendor|b0422bb475ac9ec1fe1680290970494ceff5d4eb|9d9c687dc4f55b23539aa5417b703078047efa74|uFlow|uStars|uRingCount|uBandSpread|uPillarWidth|uSheen|uFocal|uBolts|uSpokeCount/.test(
                await fs.readFile(file, 'utf8'),
              ),
              file,
            );
            scanned++;
          }
        assert.ok(
          !(await files(path.join(root, 'apps/web/public'))).some((file) =>
            /ambient|DarkVeil|Aurora/i.test(file),
          ),
        );
        report.cases.push({
          productionAssetsScanned: scanned,
          routeManifest: 'excluded',
          publicAssets: 'none',
        });
        browser = await launch();
        const page = await browser.newPage();
        page.on('pageerror', (e) => report.errors.push(e.message));
        for (const route of ['/', '/search', '/discover']) {
          const response = await page.goto(origin + route);
          assert.equal(response.status(), 200);
          // Streaming can temporarily include a loading landmark and hidden page.
          // Require the actual page content, rather than an ambiguous tag match.
          await expect(page.locator('main#main')).toBeVisible({
            timeout: 30000,
          });
          await expect(page.locator('[data-ambient-preview]')).toHaveCount(0);
          report.cases.push({ existingRoute: route, status: 200 });
        }
      } else {
        for (const route of ['/dev/ambient/custom', '/dev/ambient/library'])
          for (const suffix of ['', '/']) {
            const response = await fetch(origin + route + suffix);
            assert.equal(response.status, 404, route + suffix);
            report.cases.push({ route: route + suffix, status: 404 });
          }
        assert.equal((await fetch(origin + '/dev/ambient')).status, 200);
      }
      assert.deepEqual(report.errors, []);
    } finally {
      await fs.writeFile(
        path.join(
          evidence,
          production ? 'production.json' : 'development.json',
        ),
        JSON.stringify(report, null, 2),
      );
      await browser?.close();
      if (server) {
        const exited = once(server, 'exit');
        server.kill();
        await exited;
      }
      console.log(
        JSON.stringify({
          evidence,
          mode: report.mode,
          cases: report.cases.length,
          errors: report.errors,
          measurements: report.measurements,
        }),
      );
    }
  },
);
