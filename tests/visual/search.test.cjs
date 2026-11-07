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
  'production Search: seven widths, states, native navigation, accessibility and retry',
  { timeout: 240000 },
  async () => {
    const { createApp } = apiRequire('./dist/main');
    const { TmdbAdapter } = apiRequire('./dist/catalog/tmdb/tmdb.adapter');
    const app = await createApp();
    const calls = [];
    let rateLimited = true;
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
        if (url.pathname === '/3/genre/movie/list')
          return Response.json({ genres: [{ id: 18, name: 'Drama' }] });
        assert.equal(url.pathname, '/3/search/movie');
        const q = url.searchParams.get('query');
        if (q === 'limited' && rateLimited)
          return new Response(null, { status: 429 });
        if (q === 'unavailable') return new Response(null, { status: 500 });
        if (q === 'slow') await new Promise((r) => setTimeout(r, 700));
        const count = q === 'empty' ? 0 : q === 'sparse' ? 2 : 20;
        return Response.json({
          page: 1,
          total_pages: count === 20 ? 2 : count ? 1 : 0,
          total_results: count === 20 ? 40 : count,
          results: Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            title:
              i === 0
                ? 'A deliberately long film title about a traveller crossing the edge of the known world'
                : `Synthetic film ${i + 1}`,
            vote_count: 0,
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
    for (const method of ['search', 'genres', 'imageConfiguration'])
      adapter[method] = fake[method].bind(fake);
    let server;
    let browser;
    let exit;
    const output = [];
    const evidence = path.join(
      root,
      'tmp/stage41',
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
          await fetch(origin + '/search');
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
      const report = { widths: [], states: [], axe: [], cls: [] };
      for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + '/search');
        await expect(page.getByText('Enter a title to begin.')).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          'content',
          /noindex/,
        );
        await expect(
          page.getByRole('link', { name: 'Search', exact: true }),
        ).toHaveCSS('color', 'rgb(217, 156, 103)');
        await page.screenshot({
          path: path.join(evidence, `${width}-initial.png`),
          fullPage: true,
        });
        await page.goto(origin + '/search?q=a&page=501');
        await expect(page.getByRole('searchbox')).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        await expect(
          page.getByText('Check your search', { exact: true }),
        ).toBeVisible();
        await page.goto(origin + '/search?q=slow', { waitUntil: 'commit' });
        await expect(page.getByRole('status')).toHaveText('Searching films…');
        await expect(page.locator('.movie-card').first()).toBeVisible();
        for (const q of ['full', 'sparse', 'empty', 'unavailable', 'limited']) {
          await page.goto(origin + '/search?' + new URLSearchParams({ q }));
          if (q === 'full' || q === 'sparse') {
            await expect(page.locator('.movie-card')).toHaveCount(
              q === 'full' ? 20 : 2,
            );
            await expect(page.locator('.movie-card').first()).toBeVisible();
            const columns = await page
              .locator('.movie-card')
              .evaluateAll(
                (cards) =>
                  cards.filter(
                    (c) =>
                      Math.abs(
                        c.getBoundingClientRect().top -
                          cards[0].getBoundingClientRect().top,
                      ) < 1,
                  ).length,
              );
            assert.equal(
              columns,
              Math.min(
                q === 'sparse' ? 2 : 20,
                width < 768 ? 2 : width < 1024 ? 3 : width < 1280 ? 4 : 5,
              ),
            );
            const ratio = await page
              .locator('.movie-image')
              .first()
              .evaluate((el) => {
                const r = el.getBoundingClientRect();
                return r.width / r.height;
              });
            assert.ok(
              Math.abs(ratio - 2 / 3) < 0.01,
              'poster ratio ' + ratio + ' at ' + width + ' query ' + q,
            );
            await expect(
              page.getByRole('link', { name: /Explore A deliberately long/ }),
            ).toHaveAttribute('href', 'https://www.themoviedb.org/movie/1');
          } else
            await expect(
              page.getByText(
                q === 'empty'
                  ? 'No films found for “empty”.'
                  : q === 'limited'
                    ? 'Search is temporarily busy'
                    : 'Film search is temporarily unavailable',
                { exact: true },
              ),
            ).toBeVisible();
          assert.ok(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
            ),
            `${width} ${q} overflow`,
          );
          report.states.push({ width, q });
        }
        await page.goto(origin + '/search?q=full');
        await expect(page.locator('.movie-card')).toHaveCount(20);
        const box = await page.getByRole('searchbox').boundingBox();
        const button = await page
          .getByRole('button', { name: 'Search', exact: true })
          .boundingBox();
        assert.ok(box.height >= 48 && button.height >= 48);
        assert.ok(
          width < 768
            ? button.y >= box.y + box.height
            : Math.abs(button.y - box.y) < 1,
        );
        await page.addScriptTag({ path: axePath });
        const violations = await page.evaluate(async () =>
          (await window.axe.run()).violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.html),
          })),
        );
        assert.deepEqual(violations, []);
        report.axe.push({ width, violations });
        // Full-page screenshots do not trigger below-fold lazy image loads.
        const height = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        for (let y = 0; y < height; y += 700) {
          await page.evaluate(
            (y) => window.scrollTo({ top: y, behavior: 'instant' }),
            y,
          );
          await page.waitForTimeout(80);
        }
        await page.evaluate(() =>
          Promise.all(
            Array.from(document.images, (img) => img.decode().catch(() => {})),
          ),
        );
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        );
        await page.waitForTimeout(150);
        report.cls.push({
          width,
          sum: await page.evaluate(() =>
            window.__shifts.reduce((a, b) => a + b, 0),
          ),
        });
        await page.screenshot({
          path: path.join(evidence, `${width}-results.png`),
          fullPage: true,
        });
        if (width < 768) {
          const trigger = page.getByRole('button', { name: 'Open navigation' });
          await trigger.click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await expect(
            page
              .getByRole('dialog')
              .getByRole('link', { name: 'Search', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
        report.widths.push(width);
      }
      await page.goto(origin + '/search?q=limited');
      await expect(
        page.getByRole('button', { name: 'Try again' }),
      ).toBeVisible();
      rateLimited = false;
      const beforeRetry = calls.filter((c) =>
        c.startsWith('/3/search/movie'),
      ).length;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.locator('.movie-card')).toHaveCount(20);
      assert.ok(
        calls.filter((c) => c.startsWith('/3/search/movie')).length >
          beforeRetry,
      );
      await page.goto(origin + '/search');
      const beforeTyping = calls.length;
      await page.getByRole('searchbox').fill('Amélie & 東京');
      assert.equal(calls.length, beforeTyping);
      await page.getByRole('searchbox').press('Enter');
      await expect(page.locator('.movie-card')).toHaveCount(20);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'Amélie & 東京');
      await page.reload();
      await expect(page.locator('.movie-card')).toHaveCount(20);
      await page.goto(origin + '/search?q=empty');
      await expect(page.getByText('No films found for “empty”.')).toBeVisible();
      await page.goBack();
      await expect(page.locator('.movie-card')).toHaveCount(20);
      await page.goForward();
      await expect(page.getByText('No films found for “empty”.')).toBeVisible();
      const beforeInvalid = calls.length;
      await page.goto(origin + '/search?q=a&q=b');
      await expect(page.getByRole('searchbox')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      assert.equal(calls.length, beforeInvalid);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(origin + '/search?q=full');
      await expect(page.locator('.movie-card')).toHaveCount(20);
      const transition = await page
        .locator('.movie-image img')
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration);
      assert.ok(
        transition === '0s' ||
          transition === '1e-05s' ||
          transition === '0.00001s',
      );
      await page.goto(origin + '/search');
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Skip to content' }),
      ).toBeFocused();
      await page.getByRole('searchbox').focus();
      await page.keyboard.type('sparse');
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Search', exact: true }),
      ).toBeFocused();
      assert.deepEqual(errors, []);
      await fs.writeFile(
        path.join(evidence, 'summary.json'),
        JSON.stringify(
          {
            ...report,
            browser: browser.version(),
            pageErrors: errors,
            providerSearchCalls: calls.filter((c) =>
              c.startsWith('/3/search/movie'),
            ).length,
          },
          null,
          2,
        ),
      );
      console.log('Search evidence:', evidence);
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
