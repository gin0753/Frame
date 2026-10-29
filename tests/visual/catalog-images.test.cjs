const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { once, EventEmitter } = require('node:events');
const net = require('node:net');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const webDirectory = path.join(root, 'apps/web');

async function cleanup(primary, steps, failed = primary !== undefined) {
  const errors = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      [...(failed ? [primary] : []), ...errors],
      failed
        ? `Visual cleanup failed after: ${primary?.message ?? String(primary)}`
        : 'Visual cleanup failed',
      { cause: primary },
    );
  if (failed) throw primary;
}

async function ignoreMissing(work) {
  try {
    await work();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function withProbe(directory, contents, work, io = fs) {
  const file = path.join(directory, 'page.tsx');
  let ownsDirectory = false;
  let ownsFile = false;
  let handle;
  let primary;
  let failed = false;
  try {
    // Exclusive directory and file creation; never replace existing user work.
    await io.mkdir(directory);
    ownsDirectory = true;
    handle = await io.open(file, 'wx');
    ownsFile = true;
    await handle.writeFile(contents);
    await handle.close();
    handle = undefined;
    await work();
  } catch (error) {
    primary = error;
    failed = true;
  }
  await cleanup(
    primary,
    [
      ...(handle ? [() => handle.close()] : []),
      ...(ownsFile ? [() => ignoreMissing(() => io.unlink(file))] : []),
      ...(ownsDirectory
        ? [() => ignoreMissing(() => io.rmdir(directory))]
        : []),
    ],
    failed,
  );
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode != null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    if (hasExited(child)) finish(true);
  });
}

async function stopChild(child, gracefulMs = 5000, forcedMs = 5000) {
  if (!child || hasExited(child) || child.pid === undefined) return;
  const gracefulExit = waitForExit(child, gracefulMs);
  try {
    if (child.connected) child.send('close', () => {});
  } catch {
    /* A closed IPC channel still requires confirmed termination. */
  }
  if (await gracefulExit) return;
  const forcedExit = waitForExit(child, forcedMs);
  let killError;
  try {
    child.kill('SIGKILL');
  } catch (error) {
    killError = error;
  }
  if (!(await forcedExit))
    throw new Error('Visual child did not exit after forced shutdown', {
      cause: killError,
    });
}

async function isolatedProject() {
  await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'tmp/stage24-visual-'));
  // Next's documented custom-server `dir` gives this invocation its own project:
  // .next, next-env.d.ts and TypeScript defaults all stay inside the owned copy.
  // distDir alone would still rewrite declarations in the real application.
  // Generated output is retained here for diagnosis, never deleted by text matching.
  // Supported `dir` option: nextjs.org/docs/app/guides/custom-server
  for (const name of ['src', 'config', 'public'])
    await fs.cp(path.join(webDirectory, name), path.join(directory, name), {
      recursive: true,
    });
  for (const name of [
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    'postcss.config.mjs',
  ])
    await fs.copyFile(
      path.join(webDirectory, name),
      path.join(directory, name),
    );
  await fs.symlink(
    path.join(webDirectory, 'node_modules'),
    path.join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return directory;
}

function memoryFiles() {
  const directories = new Set();
  const files = new Map([
    ['shared/validator.ts', '// stage24-image-probe and unrelated routes'],
  ]);
  const actions = [];
  const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
  const io = {
    async mkdir(directory) {
      actions.push(['mkdir', directory]);
      if (directories.has(directory))
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      directories.add(directory);
    },
    async open(file, flag) {
      actions.push(['open', file]);
      assert.equal(flag, 'wx');
      if (files.has(file))
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      files.set(file, '');
      return {
        writeFile: async (value) => files.set(file, value),
        close: async () => {},
      };
    },
    async unlink(file) {
      actions.push(['unlink', file]);
      if (!files.delete(file)) throw missing();
    },
    async rmdir(directory) {
      actions.push(['rmdir', directory]);
      if ([...files.keys()].some((file) => path.dirname(file) === directory))
        throw Object.assign(new Error('not empty'), { code: 'ENOTEMPTY' });
      if (!directories.delete(directory)) throw missing();
    },
  };
  return { io, files, directories, actions };
}

test('probe cleanup never reads or deletes a shared validator containing the route marker', async () => {
  const state = memoryFiles();
  await withProbe('owned-probe', 'source', async () => {}, state.io);
  assert.equal(
    state.files.get('shared/validator.ts'),
    '// stage24-image-probe and unrelated routes',
  );
  assert.ok(
    state.actions.every(
      ([, name]) =>
        name === 'owned-probe' || name === path.join('owned-probe', 'page.tsx'),
    ),
  );
});

test('failure before file creation preserves the original error, cleans the directory and permits another run', async () => {
  const state = memoryFiles();
  const original = new Error('simulated probe creation failure');
  const open = state.io.open;
  state.io.open = async () => {
    throw original;
  };
  await assert.rejects(
    withProbe(
      'owned-probe',
      'source',
      async () => assert.fail('must not run'),
      state.io,
    ),
    (error) => error === original,
  );
  assert.equal(state.directories.size, 0);
  assert.equal(state.files.size, 1);
  state.io.open = open;
  await withProbe('owned-probe', 'source', async () => {}, state.io);
  assert.equal(state.directories.size, 0);
});

test('missing owned files are harmless and pre-existing directories are never removed', async () => {
  const state = memoryFiles();
  await withProbe(
    'owned-probe',
    'source',
    async () => state.io.unlink(path.join('owned-probe', 'page.tsx')),
    state.io,
  );
  state.directories.add('user-directory');
  await assert.rejects(
    withProbe('user-directory', 'source', async () => {}, state.io),
    { code: 'EEXIST' },
  );
  assert.ok(state.directories.has('user-directory'));
});

test('cleanup reports secondary failures without masking the primary error or skipping later cleanup', async () => {
  const primary = new Error('startup failure');
  const secondary = new Error('cleanup failure');
  let laterCleanup = false;
  await assert.rejects(
    cleanup(primary, [
      async () => {
        throw secondary;
      },
      async () => {
        laterCleanup = true;
      },
    ]),
    (error) =>
      error instanceof AggregateError &&
      error.cause === primary &&
      error.errors.includes(primary) &&
      error.errors.includes(secondary),
  );
  assert.ok(laterCleanup);
  const state = memoryFiles();
  await assert.rejects(
    withProbe(
      'owned-probe',
      'source',
      async () => {
        throw undefined;
      },
      state.io,
    ),
    (error) => error === undefined,
  );
  assert.equal(state.directories.size, 0);
});

test('failed forced kill is not reported as confirmed shutdown', async () => {
  const child = Object.assign(new EventEmitter(), {
    pid: 1,
    exitCode: null,
    signalCode: null,
    connected: true,
    send() {},
    kill() {
      return false;
    },
  });
  await assert.rejects(stopChild(child, 1, 1), /did not exit/);
  assert.equal(child.listenerCount('exit'), 0);
});

for (const graceful of [true, false])
  test(`real child ${graceful ? 'graceful' : 'forced'} shutdown waits for exit`, async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `process.on('message', () => { if (${graceful}) process.exit(0); }); process.send('ready'); setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    child.on('error', () => {});
    try {
      await once(child, 'message');
      await stopChild(child, 100, 3000);
      assert.ok(hasExited(child));
      assert.equal(child.listenerCount('exit'), 0);
    } finally {
      await stopChild(child, 1, 3000);
    }
  });

// Test-owned route only; never a production catalog composition or provider call.
const source = `
import { Hero } from '@/features/movies/components/hero';
import { MovieRail } from '@/features/movies/components/movie-rail';
import { toMoviePreview } from '@/features/movies/data/catalog-adapter';
import { movieImageFallbacks } from '@/features/movies/data/image-fallbacks';
export default async function Probe({ searchParams }: { searchParams: Promise<{ failure?: string }> }) {
  const file = (await searchParams).failure ? 'failed.jpg' : 'synthetic.jpg';
  const movies = ['complete', 'poster', 'backdrop', 'both'].map((missing, index) => toMoviePreview({
    id: 42 + index, source: 'tmdb', title: ('A very long synthetic film title ').repeat(6).trim(),
    releaseDate: null, overview: null, genreIds: [], voteAverage: null, voteCount: 0,
    posterUrl: ['poster', 'both'].includes(missing) ? null : 'https://image.tmdb.org/t/p/w500/' + file,
    backdropUrl: ['backdrop', 'both'].includes(missing) ? null : 'https://image.tmdb.org/t/p/w1280/' + file,
    externalUrl: 'https://www.themoviedb.org/movie/' + (42 + index),
    attribution: { provider: 'tmdb', sourceUrl: 'https://www.themoviedb.org/movie/' + (42 + index) },
  }, [], movieImageFallbacks).movie);
  return <main><Hero movie={movies[0]} /><MovieRail id="synthetic-landscape" title="Synthetic landscape" eyebrow="SYNTHETIC" description="Synthetic geometry verification" movies={movies} /><MovieRail id="synthetic-posters" title="Synthetic posters" eyebrow="SYNTHETIC" description="Synthetic geometry verification" movies={movies} variant="poster" /></main>;
}
`;

test(
  'real Chromium fixture geometry, synthetic missing/failed artwork and responsive crops',
  { timeout: 240000 },
  async () => {
    const project = await isolatedProject();
    const probeDirectory = path.join(project, 'src/app/stage24-image-probe');
    const evidence = path.join(
      root,
      'tmp/stage-2.4-visual',
      path.basename(project),
    );
    await withProbe(probeDirectory, source, async () => {
      let child;
      let browser;
      let logs = '';
      let primary;
      let failed = false;
      const checks = [];
      try {
        await fs.mkdir(evidence, { recursive: true });
        const socket = net.createServer();
        socket.listen(0, '127.0.0.1');
        await once(socket, 'listening');
        const port = socket.address().port;
        await new Promise((resolve) => socket.close(resolve));
        const origin = `http://127.0.0.1:${port}`;
        child = spawn(
          process.execPath,
          [
            '-e',
            `const next = require(${JSON.stringify(webRequire.resolve('next'))});
          const http = require('node:http');
          const app = next({ dev: true, hostname: '127.0.0.1', port: ${port}, dir: ${JSON.stringify(project)} });
          app.prepare().then(() => {
            const server = http.createServer(app.getRequestHandler());
            server.listen(${port}, '127.0.0.1');
            process.on('message', async () => { server.closeAllConnections(); server.close(); await app.close(); process.exit(0); });
          });`,
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              FRAME_LOCAL_API_PROXY: 'false',
              __NEXT_NODE_NATIVE_TS_LOADER_ENABLED: 'true',
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          },
        );
        child.on('error', (error) => {
          logs += String(error);
        });
        child.stdout.on('data', (value) => {
          logs += value;
        });
        child.stderr.on('data', (value) => {
          logs += value;
        });
        for (let attempt = 0; ; attempt++) {
          try {
            if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok)
              break;
          } catch {
            /* Startup only. */
          }
          if (attempt >= 90 || child.exitCode !== null)
            throw new Error('Visual server unavailable');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        browser = await chromium.launch({
          headless: true,
          executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
        });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(origin);
          await page
            .locator('.hero-backdrop')
            .evaluate((image) => image.decode());
          await page
            .locator('.movie-image')
            .first()
            .waitFor({ state: 'visible' });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          const crop = await page
            .locator('.hero-backdrop')
            .evaluate((image) => getComputedStyle(image).objectPosition);
          assert.equal(crop, width < 768 ? '65% 50%' : '70% 50%');
          const ratios = await page
            .locator('.movie-image')
            .evaluateAll((elements) =>
              elements
                .filter(
                  (element) =>
                    element.clientWidth > 0 && element.clientHeight > 0,
                )
                .map((element) => ({
                  poster: element.closest('.movie-card-poster') !== null,
                  ratio: element.clientWidth / element.clientHeight,
                })),
            );
          assert.ok(
            ratios.length >= 15,
            'visible fixture cards must actually be measured',
          );
          for (const { poster, ratio } of ratios)
            assert.ok(
              Math.abs(ratio - (poster ? 2 / 3 : 16 / 9)) < 0.03,
              JSON.stringify({ width, poster, ratio }),
            );
          await expect(
            page
              .getByRole('link', { name: 'Explore Charge on Blender Studio' })
              .first(),
          ).toBeVisible();
          await page.screenshot({
            path: path.join(evidence, `${width}-homepage.png`),
            fullPage: true,
          });
          checks.push({ width, crop, cards: ratios.length });
        }
        const syntheticArtwork = (route) => {
          const poster = route.request().url().includes('/w500/');
          return route.fulfill({
            contentType: 'image/svg+xml',
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="${poster ? 500 : 1280}" height="${poster ? 750 : 720}"><path fill="#1c1e22" d="M0 0h1280v750H0z"/></svg>`,
          });
        };
        await page.route('https://image.tmdb.org/**', syntheticArtwork);
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(origin + '/stage24-image-probe');
          await page
            .locator('.movie-image')
            .first()
            .waitFor({ state: 'visible' });
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          const before = await page
            .locator('.movie-image')
            .evaluateAll((elements) =>
              elements.map((element) => [
                element.clientWidth,
                element.clientHeight,
              ]),
            );
          assert.equal(before.length, 8);
          assert.ok(before.every(([width, height]) => width > 0 && height > 0));
          await page.screenshot({
            path: path.join(evidence, `${width}-synthetic.png`),
            fullPage: true,
          });
          await page.unroute('https://image.tmdb.org/**');
          await page.route('https://image.tmdb.org/**', (route) =>
            route.abort(),
          );
          await page.goto(origin + '/stage24-image-probe?failure=1');
          await page
            .locator('.movie-image')
            .first()
            .waitFor({ state: 'visible' });
          await expect(page.locator('.hero-image')).toContainText(
            'Image unavailable',
          );
          await expect(page.locator('.poster-title').first()).toBeHidden();
          assert.deepEqual(
            await page
              .locator('.movie-image')
              .evaluateAll((elements) =>
                elements.map((element) => [
                  element.clientWidth,
                  element.clientHeight,
                ]),
              ),
            before,
          );
          await expect(
            page.getByRole('link', { name: /Explore .* on TMDB/ }).first(),
          ).toHaveAttribute('href', 'https://www.themoviedb.org/movie/42');
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: path.join(evidence, `${width}-failed.png`),
            fullPage: true,
          });
          await page.unroute('https://image.tmdb.org/**');
          await page.route('https://image.tmdb.org/**', syntheticArtwork);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(origin);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Charge' }),
        ).toBeVisible();
        assert.deepEqual(errors, []);
        console.log(
          JSON.stringify({
            browser: browser.version(),
            fixtureWidths: checks,
            syntheticWidths: [320, 1440],
            screenshots: evidence,
            pageErrors: errors.length,
          }),
        );
      } catch (error) {
        console.error(error, logs.slice(-3000));
        primary = error;
        failed = true;
      }
      await cleanup(
        primary,
        [() => browser?.close(), () => stopChild(child)],
        failed,
      );
    });
  },
);
