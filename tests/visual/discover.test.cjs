// Production Next/Nest acceptance using synthetic provider transport only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const lintRequire = createRequire(webRequire.resolve('eslint-config-next'));
const a11yRequire = createRequire(
  lintRequire.resolve('eslint-plugin-jsx-a11y'),
);
const axePath = a11yRequire.resolve('axe-core');

test(
  'production Discover: seven widths, filters, failures, native navigation and accessibility',
  { timeout: 360000 },
  async () => {
    const { createApp } = apiRequire('./dist/main');
    const { TmdbAdapter } = apiRequire('./dist/catalog/tmdb/tmdb.adapter');
    const app = await createApp();
    const calls = [];
    let mode = 'full';
    let dictionaryMode = 'normal';
    const config = {
      images: {
        secure_base_url: 'https://image.tmdb.org/t/p/',
        poster_sizes: ['w500'],
        backdrop_sizes: ['w1280'],
      },
    };
    const fake = new TmdbAdapter({
      config: { enabled: true, token: 'synthetic.search.token' },
      fetch: async (url) => {
        calls.push(url.pathname + url.search);
        if (url.pathname === '/3/configuration') return Response.json(config);
        if (url.pathname === '/3/genre/movie/list') {
          if (dictionaryMode === 'slow')
            await new Promise((r) => setTimeout(r, 1200));
          if (dictionaryMode === 'failed')
            return new Response(null, { status: 500 });
          return Response.json({
            genres: [
              { id: 18, name: 'Drama' },
              {
                id: 28,
                name: 'Action and a deliberately long genre option label',
              },
            ],
          });
        }
        assert.equal(url.pathname, '/3/discover/movie');
        if (mode === 'limited') return new Response(null, { status: 429 });
        if (mode === 'unavailable') return new Response(null, { status: 500 });
        if (mode === 'slow') await new Promise((r) => setTimeout(r, 700));
        const count = mode === 'empty' ? 0 : mode === 'sparse' ? 2 : 20;
        return Response.json({
          page: 1,
          total_pages: count === 20 ? 2 : count ? 1 : 0,
          total_results: count === 20 ? 40 : count,
          results: Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            title:
              i === 0
                ? 'A deliberately long film title about a traveller crossing the edge of the known world'
                : 'Synthetic film ' + (i + 1),
            vote_count: 200,
            genre_ids: [18],
            release_date: i % 2 ? '2020-01-01' : null,
            poster_path:
              i % 3 ? (i % 2 ? '/synthetic.jpg' : '/failed.jpg') : null,
            backdrop_path: null,
            overview: null,
          })),
        });
      },
    });
    // These sparse terminal fixtures remain useful regressions; pagination.test.cjs also covers sparse nonterminal pages.
    const adapter = app.get(TmdbAdapter);
    for (const method of ['discover', 'genres', 'imageConfiguration'])
      adapter[method] = fake[method].bind(fake);
    let server;
    let browser;
    let exit;
    const output = [];
    const evidence = path.join(
      root,
      'tmp/stage42',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
    try {
      await app.listen(0, '127.0.0.1');
      const socket = net.createServer();
      socket.listen(0, '127.0.0.1');
      await once(socket, 'listening');
      const port = socket.address().port;
      await new Promise((r) => socket.close(r));
      const origin = `http://127.0.0.1:${port}`;
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
        {
          cwd: root,
          env: {
            ...process.env,
            FRAME_API_ORIGIN: await app.getUrl(),
            FRAME_LOCAL_API_PROXY: 'false',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      exit = once(server, 'exit');
      server.stdout.on('data', (b) => output.push(String(b)));
      server.stderr.on('data', (b) => output.push(String(b)));
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(output.join(''));
        try {
          await fetch(origin + '/discover');
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      assert.ok(ready, 'Next ready');
      await fs.mkdir(evidence, { recursive: true });
      browser = await chromium.launch({
        executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
        headless: true,
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('https://image.tmdb.org/**', (route) =>
        route.request().url().endsWith('/failed.jpg')
          ? route.fulfill({ status: 404, body: '' })
          : route.fulfill({
              path: path.join(
                root,
                'apps/web/public/images/films/spring-poster.webp',
              ),
              contentType: 'image/webp',
            }),
      );
      await page.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__shifts.push(entry.value);
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const report = { widths: [], states: [], axe: [], cls: [], requests: [] };
      const primeArtwork = async () => {
        await page.evaluate(async () => {
          const images = Array.from(document.querySelectorAll('img'));
          images.forEach((image) => (image.loading = 'eager'));
          await Promise.all(
            images.map((image) => image.decode().catch(() => {})),
          );
        });
      };
      const movieCalls = () =>
        calls.filter((c) => c.startsWith('/3/discover/movie')).length;
      for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        mode = 'full';
        dictionaryMode = 'normal';
        await page.goto(origin + '/discover');
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
        await expect(
          page.locator('.desktop-nav a[href="/discover"]'),
        ).toHaveAttribute('aria-current', 'page');
        const geometry = await page
          .locator('.movie-card')
          .evaluateAll((cards) => {
            const a = cards[0].getBoundingClientRect();
            return {
              columns: cards.filter(
                (c) => Math.abs(c.getBoundingClientRect().top - a.top) < 2,
              ).length,
              ratio:
                cards[0].querySelector('.movie-image').getBoundingClientRect()
                  .height / a.width,
            };
          });
        assert.equal(
          geometry.columns,
          width < 768 ? 2 : width < 1024 ? 3 : width < 1280 ? 4 : 5,
        );
        assert.ok(Math.abs(geometry.ratio - 1.5) < 0.03);
        const years = await page
          .locator('input[name="yearFrom"],input[name="yearTo"]')
          .evaluateAll((inputs) =>
            inputs.map((el) => {
              const r = el.getBoundingClientRect();
              return { top: r.top, width: r.width };
            }),
          );
        assert.equal(years[0].top, years[1].top);
        assert.ok(years[0].width >= 120);
        const heights = await page
          .locator(
            'main input[type="text"],main select,main button[type="submit"]',
          )
          .evaluateAll((els) =>
            els.map((e) => e.getBoundingClientRect().height),
          );
        assert.ok(heights.every((h) => h >= 48));
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.addScriptTag({ path: axePath });
        const axe = await page.evaluate(() =>
          window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          }),
        );
        assert.deepEqual(
          axe.violations.map((v) => v.id),
          [],
        );
        report.axe.push({ width, violations: 0 });
        await primeArtwork();
        await page.screenshot({
          path: path.join(evidence, width + '-default.png'),
          fullPage: true,
        });
        const beforeEdit = movieCalls();
        await page.getByLabel('Genre', { exact: true }).selectOption('18');
        await page.getByLabel('From year', { exact: true }).fill('1990');
        await page.getByLabel('To year', { exact: true }).fill('1999');
        await page.getByLabel('Sort', { exact: true }).selectOption('rated');
        assert.equal(movieCalls(), beforeEdit);
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await expect(
          page.getByText(/Drama.*1990.*1999.*Highest TMDB Rated/),
        ).toBeVisible();
        assert.equal(new URL(page.url()).searchParams.get('sort'), 'rated');
        await page.reload();
        await expect(page.getByLabel('From year', { exact: true })).toHaveValue(
          '1990',
        );
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
        await primeArtwork();
        await page.screenshot({
          path: path.join(evidence, width + '-filtered.png'),
          fullPage: true,
        });
        for (const sort of ['popular', 'newest', 'rated']) {
          await page.goto(origin + '/discover?sort=' + sort);
          await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
            sort,
          );
          await expect(page.locator('.movie-card')).toHaveCount(20);
          report.states.push({ width, state: sort });
        }
        for (const query of [
          'yearFrom=2000&yearTo=1999',
          'yearFrom=abc',
          'genreId=999',
          'sort=invalid',
          'genreId=18&genreId=28',
          'unknown=x',
        ]) {
          const before = movieCalls();
          await page.goto(origin + '/discover?' + query);
          await expect(
            page.getByRole('heading', { name: 'Check your filters' }),
          ).toBeVisible();
          assert.equal(movieCalls(), before);
          if (query === 'yearFrom=abc') {
            await page.addScriptTag({ path: axePath });
            const invalidAxe = await page.evaluate(() =>
              window.axe.run(document, {
                runOnly: {
                  type: 'tag',
                  values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
                },
              }),
            );
            assert.deepEqual(
              invalidAxe.violations.map((v) => v.id),
              [],
            );
            report.axe.push({ width, state: 'invalid', violations: 0 });
            if ([393, 1440].includes(width))
              await page.screenshot({
                path: path.join(evidence, width + '-invalid.png'),
                fullPage: true,
              });
          }
          report.states.push({ width, state: query });
        }
        for (const state of ['empty', 'sparse', 'limited', 'unavailable']) {
          mode = state;
          await page.goto(origin + '/discover');
          if (state === 'empty')
            await expect(
              page.getByText('No films match these filters.'),
            ).toBeVisible();
          else if (state === 'sparse')
            await expect(page.locator('.movie-card')).toHaveCount(2);
          else
            await expect(
              page.getByRole('button', { name: 'Try again' }),
            ).toBeVisible();
          if (['limited', 'unavailable'].includes(state)) {
            const retry = page.getByRole('button', { name: 'Try again' });
            assert.ok((await retry.boundingBox()).height >= 48);
            const recovery = await retry.evaluate((button) => {
              const form = button.closest('form');
              const reset = form.nextElementSibling;
              return (
                reset.getBoundingClientRect().left -
                form.getBoundingClientRect().right
              );
            });
            assert.ok(recovery >= 12);
          }
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          report.states.push({ width, state });
          if (['empty', 'unavailable'].includes(state)) {
            await page.addScriptTag({ path: axePath });
            const stateAxe = await page.evaluate(() =>
              window.axe.run(document, {
                runOnly: {
                  type: 'tag',
                  values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
                },
              }),
            );
            assert.deepEqual(
              stateAxe.violations.map((v) => v.id),
              [],
            );
            report.axe.push({ width, state, violations: 0 });
            if ([393, 1440].includes(width))
              await page.screenshot({
                path: path.join(evidence, width + '-' + state + '.png'),
                fullPage: true,
              });
          }
        }
        mode = 'full';
        dictionaryMode = 'failed';
        await page.goto(origin + '/discover');
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await expect(page.getByLabel('Genre', { exact: true })).toBeDisabled();
        await page.goto(origin + '/discover?genreId=18');
        await expect(
          page.getByRole('heading', {
            name: 'Films are temporarily unavailable.',
          }),
        ).toBeVisible();
        await expect(page.locator('input[name="genreId"]').first()).toHaveValue(
          '18',
        );
        report.states.push({
          width,
          state: 'dictionary-failed-selected-and-default',
        });
        dictionaryMode = 'slow';
        await page.goto(origin + '/discover', { waitUntil: 'commit' });
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await expect(page.getByLabel('Genre', { exact: true })).toBeDisabled();
        await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
        report.states.push({ width, state: 'slow-optional-dictionary' });
        dictionaryMode = 'normal';
        mode = 'slow';
        await page.goto(origin + '/discover', { waitUntil: 'commit' });
        await expect(page.getByRole('status')).toHaveText('Loading films…');
        if ([393, 1440].includes(width))
          await page.screenshot({
            path: path.join(evidence, width + '-loading.png'),
            fullPage: true,
          });
        await expect(page.locator('.movie-card')).toHaveCount(20);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        report.cls.push({
          width,
          value: await page.evaluate(() =>
            window.__shifts.reduce((a, b) => a + b, 0),
          ),
        });
        if (width < 768) {
          const trigger = page.getByRole('button', { name: 'Open navigation' });
          await trigger.click();
          await expect(
            page
              .getByRole('dialog')
              .getByRole('link', { name: 'Discover', exact: true }),
          ).toHaveAttribute('href', '/discover');
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
        report.widths.push(width);
      }
      mode = 'limited';
      await page.goto(origin + '/discover?genreId=18&sort=rated');
      await expect(
        page.getByRole('button', { name: 'Try again' }),
      ).toBeVisible();
      mode = 'full';
      const beforeRetry = movieCalls();
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.locator('.movie-card')).toHaveCount(20);
      assert.ok(movieCalls() > beforeRetry);
      assert.equal(new URL(page.url()).searchParams.get('genreId'), '18');
      await page
        .locator('form[aria-label="Discover filters"]')
        .getByRole('link', { name: 'Reset', exact: true })
        .click();
      await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
        'popular',
      );
      assert.equal(new URL(page.url()).search, '');
      await page.goto(origin + '/discover?sort=newest');
      await page.goto(origin + '/discover?sort=rated');
      await page.goBack();
      await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
        'newest',
      );
      await page.goForward();
      await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
        'rated',
      );
      // History navigation may restore the form shell before streamed options.
      // Exercise keyboard order only once its actual Genre control is ready.
      await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
      await expect(page.locator('.movie-card')).toHaveCount(20);
      await page.getByLabel('Genre', { exact: true }).focus();
      await expect(page.getByLabel('Genre', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('From year', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('To year', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Sort', { exact: true })).toBeFocused();
      await page.keyboard.press('Home');
      await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
        'popular',
      );
      await page.keyboard.press('End');
      await expect(page.getByLabel('Sort', { exact: true })).toHaveValue(
        'rated',
      );
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Apply', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page
          .getByRole('form', { name: 'Discover filters' })
          .getByRole('link', { name: 'Reset', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(
        page.getByRole('button', { name: 'Apply', exact: true }),
      ).toBeFocused();
      await page.getByLabel('To year', { exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByLabel('From year', { exact: true })).toBeFocused();
      assert.equal(
        await page
          .getByLabel('From year', { exact: true })
          .evaluate((e) => getComputedStyle(e).outlineStyle),
        'solid',
      );
      await page.keyboard.type('2000');
      await page.keyboard.press('Enter');
      await expect(page.locator('.movie-card')).toHaveCount(20);
      assert.equal(new URL(page.url()).searchParams.get('yearFrom'), '2000');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(origin + '/discover');
      await expect(page.locator('.movie-card')).toHaveCount(20);
      const transition = await page
        .locator('.movie-image img')
        .first()
        .evaluate((e) => getComputedStyle(e).transitionDuration);
      assert.ok(['0s', '1e-05s', '0.00001s'].includes(transition));
      await expect(
        page.getByText(
          'This product uses the TMDB API but is not endorsed or certified by TMDB.',
        ),
      ).toBeVisible();
      assert.equal(
        calls.some((c) => /^\/3\/movie\/\d+/.test(c)),
        false,
      );
      assert.deepEqual(errors, []);
      await fs.writeFile(
        path.join(evidence, 'summary.json'),
        JSON.stringify(
          {
            ...report,
            browser: browser.version(),
            pageErrors: errors,
            providerDiscoverCalls: movieCalls(),
            calls,
          },
          null,
          2,
        ),
      );
      console.log('Discover evidence:', evidence);
    } finally {
      await browser?.close();
      if (server && server.exitCode === null) {
        server.kill();
        await exit;
      }
      await app.close();
    }
  },
);
