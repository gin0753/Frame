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
  'production pagination: Search and Discover native page state at seven widths',
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
        assert.ok(
          ['/3/search/movie', '/3/discover/movie'].includes(url.pathname),
        );
        const requestedPage = Number(url.searchParams.get('page'));
        if (requestedPage === 3 && rateLimited)
          return new Response(null, { status: 429 });
        const q = url.searchParams.get('query');
        if (q === 'limited' && rateLimited)
          return new Response(null, { status: 429 });
        if (q === 'unavailable') return new Response(null, { status: 500 });
        if (q === 'slow') await new Promise((r) => setTimeout(r, 700));
        const count = requestedPage > 3 ? 0 : requestedPage === 2 ? 2 : 20;
        return Response.json({
          page: requestedPage,
          total_pages: 3,
          total_results: 60,
          results: Array.from({ length: count }, (_, i) => ({
            id: requestedPage * 100 + i + 1,
            title:
              i === 0
                ? 'A deliberately long film title about a traveller crossing the edge of the known world'
                : `Synthetic page ${requestedPage} film ${i + 1}`,
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
    // Deliberately sparse nonterminal fixture exercises the scoped compatibility policy.
    const adapter = app.get(TmdbAdapter);
    for (const method of ['search', 'discover', 'genres', 'imageConfiguration'])
      adapter[method] = fake[method].bind(fake);
    let server;
    let browser;
    let exit;
    const output = [];
    const evidence =
      process.env.FRAME_PAGINATION_EVIDENCE_DIRECTORY ||
      path.join(
        root,
        'tmp/stage43',
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
        for (const kind of ['search', 'discover']) {
          const tuple =
            kind === 'search'
              ? 'q=Am%C3%A9lie+%26+%E6%9D%B1%E4%BA%AC'
              : 'genreId=18&yearFrom=1990&yearTo=1999&sort=rated';
          const base = origin + '/' + kind + '?' + tuple;
          rateLimited = false;
          const before = calls.filter((c) =>
            c.startsWith(
              '/3/' + (kind === 'search' ? 'search/movie' : 'discover/movie'),
            ),
          ).length;
          await page.goto(base + '&page=2');
          await expect(page.getByText('Page 2 of 3')).toBeVisible();
          await expect(page.locator('.movie-card')).toHaveCount(2);
          const next = page.getByRole('link', { name: 'Next', exact: true });
          const href = await next.getAttribute('href');
          assert.equal(new URL(href, origin).searchParams.get('page'), '3');
          const previous = page.getByRole('link', {
            name: 'Previous',
            exact: true,
          });
          assert.equal(
            new URL(
              await previous.getAttribute('href'),
              origin,
            ).searchParams.has('page'),
            false,
          );
          assert.equal(
            calls.filter((c) =>
              c.startsWith(
                '/3/' + (kind === 'search' ? 'search/movie' : 'discover/movie'),
              ),
            ).length - before,
            1,
          );
          const target = await next.boundingBox();
          assert.ok(target.height >= 48);
          const [opened] = await Promise.all([
            page.context().waitForEvent('page'),
            next.click({ modifiers: ['Control'] }),
          ]);
          await expect(opened.getByText('Page 3 of 3')).toBeVisible();
          await opened.close();
          await next.focus();
          await expect(next).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(page.getByText('Page 3 of 3')).toBeVisible();
          await expect(page.locator('.movie-card')).toHaveCount(20);
          await expect(
            page.getByRole('link', { name: 'Next', exact: true }),
          ).toHaveCount(0);
          await page.goBack();
          await expect(page).toHaveURL(base + '&page=2');
          await expect(page.getByText('Page 2 of 3')).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/201"]',
            ),
          ).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/301"]',
            ),
          ).toHaveCount(0);
          await page.goForward();
          await expect(page).toHaveURL(base + '&page=3');
          await expect(page.getByText('Page 3 of 3')).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/301"]',
            ),
          ).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/201"]',
            ),
          ).toHaveCount(0);
          await page.reload();
          await expect(page).toHaveURL(base + '&page=3');
          await expect(page.getByText('Page 3 of 3')).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/301"]',
            ),
          ).toBeVisible();
          await expect(
            page.locator(
              '.movie-card a[href="https://www.themoviedb.org/movie/201"]',
            ),
          ).toHaveCount(0);
          await page
            .getByRole('link', { name: 'Previous', exact: true })
            .click();
          await expect(page.getByText('Page 2 of 3')).toBeVisible();
          await page.getByRole('link', { name: 'Next', exact: true }).click();
          await expect(page.getByText('Page 3 of 3')).toBeVisible();
          if (kind === 'search') {
            await page.getByRole('searchbox').fill('new title');
            await page
              .getByRole('button', { name: 'Search', exact: true })
              .click();
          } else {
            await expect(page.locator('#discover-genre')).toBeEnabled();
            await page.locator('#discover-yearFrom').fill('2000');
            await page.locator('#discover-yearTo').fill('2001');
            await page
              .getByRole('button', { name: 'Apply', exact: true })
              .click();
          }
          await expect(page.getByText('Page 1 of 3')).toBeVisible();
          assert.equal(new URL(page.url()).searchParams.has('page'), false);
          rateLimited = true;
          await page.goto(base + '&page=3');
          await expect(
            page.getByRole('button', { name: 'Try again' }),
          ).toBeVisible();
          rateLimited = false;
          await page.getByRole('button', { name: 'Try again' }).click();
          await expect(page.getByText('Page 3 of 3')).toBeVisible();
          assert.equal(new URL(page.url()).searchParams.get('page'), '3');
          await page.goto(base + '&page=4');
          await expect(
            page.getByRole('link', { name: 'Return to page 1' }),
          ).toBeVisible();
          await page.getByRole('link', { name: 'Return to page 1' }).click();
          await expect(page.getByText('Page 1 of 3')).toBeVisible();
          for (const invalid of ['501', '01', '2&page=2']) {
            await page.goto(base + '&page=' + invalid);
            await expect(
              page.getByText(
                kind === 'search' ? 'Check your search' : 'Check your filters',
                { exact: true },
              ),
            ).toBeVisible();
          }
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto(base + '&page=2');
          await expect(page.getByText('Page 2 of 3')).toBeVisible();
          assert.equal(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth,
            ),
            false,
          );
          await page.addScriptTag({ path: axePath });
          const violations = await page.evaluate(async () =>
            (await axe.run()).violations.map((v) => v.id),
          );
          assert.deepEqual(violations, []);
          report.axe.push({ width, kind, violations });
          report.states.push({
            width,
            kind,
            deepLink: 2,
            lastPage: 3,
            emptyPage: 4,
            retryPage: 3,
          });
          report.cls.push({
            width,
            kind,
            sum: await page.evaluate(() =>
              window.__shifts.reduce((a, b) => a + b, 0),
            ),
          });
          await page.screenshot({
            path: path.join(evidence, kind + '-' + width + '.png'),
            fullPage: true,
          });
          if (kind === 'discover') {
            await page
              .getByRole('link', { name: 'Reset', exact: true })
              .click();
            await expect(page.getByText('Page 1 of 3')).toBeVisible();
            assert.equal(new URL(page.url()).search, '');
          }
        }
        report.widths.push(width);
      }
      assert.equal(
        calls.some((c) => /movie\/\d+/.test(c)),
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
            providerSearchCalls: calls.filter((c) =>
              c.startsWith('/3/search/movie'),
            ).length,
          },
          null,
          2,
        ),
      );
      console.log('Pagination evidence:', evidence);
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
