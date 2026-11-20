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
const web = createRequire(path.join(root, 'apps/web/package.json'));
const api = createRequire(path.join(root, 'apps/api/package.json'));
const lint = createRequire(web.resolve('eslint-config-next'));
const axe = createRequire(lint.resolve('eslint-plugin-jsx-a11y')).resolve(
  'axe-core',
);

test(
  'production movie detail browser evidence',
  { timeout: 240000 },
  async () => {
    const { createApp } = api('./dist/main');
    const { TmdbAdapter } = api('./dist/catalog/tmdb/tmdb.adapter');
    const app = await createApp();
    const calls = [];
    const fake = new TmdbAdapter({
      config: { enabled: true, token: 'synthetic.token' },
      fetch: async (url) => {
        calls.push(url.pathname);
        if (url.pathname === '/3/configuration')
          return Response.json({
            images: {
              secure_base_url: 'https://image.tmdb.org/t/p/',
              poster_sizes: ['w500'],
              backdrop_sizes: ['w1280'],
              profile_sizes: ['w185'],
            },
          });
        const id = Number(url.pathname.split('/').pop());
        if (id === 404) return new Response(null, { status: 404 });
        if (id === 429) return new Response(null, { status: 429 });
        if (id === 503) return new Response(null, { status: 503 });
        if (id === 4) await new Promise((resolve) => setTimeout(resolve, 1000));
        const missing = id === 2;
        return Response.json({
          id,
          title:
            id === 3
              ? 'A remarkably long film title about a traveller crossing the edge of the known universe and finding home'
              : 'The Shape of Tomorrow',
          original_title: 'La Forme de Demain',
          vote_count: missing ? 0 : 1420,
          vote_average: 7.8,
          genres: [{ id: 18, name: 'Drama' }],
          release_date: '2020-02-01',
          runtime: 120,
          overview: missing
            ? ''
            : 'A story of discovery, memory, and the people we meet along the way. '.repeat(
                8,
              ),
          poster_path: missing ? null : '/poster.jpg',
          backdrop_path: missing ? null : '/backdrop.jpg',
          credits: {
            crew: missing
              ? []
              : [{ id: 1, name: 'A Director', job: 'Director' }],
            cast: Array.from({ length: 10 }, (_, index) => ({
              id: index + 2,
              name: index === 0 ? 'Alex Example' : `Cast Member ${index + 1}`,
              character:
                index === 0 ? 'The Traveller' : `Character ${index + 1}`,
              order: index,
              profile_path: missing ? null : '/profile.jpg',
            })),
          },
          videos: {
            results: missing
              ? []
              : [
                  {
                    id: 'x',
                    site: 'YouTube',
                    type: 'Trailer',
                    official: true,
                    key: 'abcdefghijk',
                  },
                ],
          },
        });
      },
    });
    const adapter = app.get(TmdbAdapter);
    for (const method of ['details', 'imageConfiguration'])
      adapter[method] = fake[method].bind(fake);
    let server, browser;
    const evidence = path.join(root, 'tmp/stage52e-evidence');
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
          web.resolve('next/dist/bin/next'),
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
          stdio: 'ignore',
        },
      );
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          await fetch(origin + '/movies/1');
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      assert.ok(ready);
      await fs.mkdir(evidence, { recursive: true });
      browser = await chromium.launch({
        executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
        headless: true,
      });
      const page = await browser.newPage();
      let fixture = 'spring';
      await page.route('https://image.tmdb.org/**', (route) =>
        fixture === 'white' && route.request().url().includes('/backdrop.jpg')
          ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="white"/></svg>' })
          : route.fulfill({
          path: path.join(
            root,
            `apps/web/public/images/films/${fixture === 'white' ? 'spring' : fixture}-backdrop.webp`,
          ),
          contentType: 'image/webp',
        }),
      );
      await page.addInitScript(() => {
        window.__metrics = { cls: 0, lcp: null };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) window.__metrics.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          const e = list.getEntries().at(-1);
          window.__metrics.lcp = {
            time: e.startTime,
            element: e.element?.outerHTML.slice(0, 200),
          };
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      const report = [];
      for (const width of [320, 393, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const before = calls.filter((p) => p === '/3/movie/1').length;
        const response = await page.goto(origin + '/movies/1', {
          waitUntil: 'networkidle',
        });
        await expect(
          page.getByRole('heading', {
            name: 'The Shape of Tomorrow',
            level: 1,
          }),
        ).toBeVisible();
        assert.equal(
          calls.filter((p) => p === '/3/movie/1').length - before,
          1,
          'one detail request for page and metadata',
        );
        assert.equal(await page.title(), 'The Shape of Tomorrow — FRAME');
        const overflow = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          elements: [...document.querySelectorAll('*')]
            .filter(
              (e) =>
                e.getBoundingClientRect().right >
                document.documentElement.clientWidth + 1,
            )
            .slice(0, 12)
            .map((e) => ({
              tag: e.tagName,
              class: e.className,
              right: e.getBoundingClientRect().right,
            })),
        }));
        assert.ok(
          overflow.width <= overflow.client,
          `${width} overflow ${JSON.stringify(overflow)}`,
        );
        const geometry = await page
          .getByRole('heading', { name: 'Top cast' })
          .locator('..')
          .locator('li')
          .evaluateAll((items) => {
            const rects = items.map((item) => item.getBoundingClientRect());
            return {
              count: rects.length,
              firstRow: rects.filter((r) => Math.abs(r.top - rects[0].top) < 1)
                .length,
            };
          });
        assert.deepEqual(geometry, {
          count: 10,
          firstRow: width >= 1280 ? 5 : width >= 768 ? 4 : 3,
        });
        if (width < 768) {
          const intro = await page
            .getByRole('heading', { name: 'Overview' })
            .locator('..')
            .evaluate((section) => {
              const overview = section.getBoundingClientRect();
              const poster =
                section.previousElementSibling.getBoundingClientRect();
              return {
                overviewTop: overview.top,
                posterBottom: poster.bottom,
                overviewWidth: overview.width,
                parentWidth:
                  section.parentElement.getBoundingClientRect().width,
                posterRatio: poster.width / poster.height,
              };
            });
          assert.ok(
            intro.overviewTop >= intro.posterBottom &&
              intro.overviewWidth >= intro.parentWidth - 1,
            JSON.stringify(intro),
          );
          assert.ok(Math.abs(intro.posterRatio - 2 / 3) < 0.01);
        }
        const rail = page.locator('nav[aria-label="Film navigation"]');
        assert.equal(await rail.isVisible(), width >= 1024);
        const header = page.locator('.detail-site-header');
        const hero = page.locator('section[aria-labelledby="film-title"]');
        const shell = await header.evaluate((el) => ({
          position: getComputedStyle(el).position,
          top: el.getBoundingClientRect().top,
        }));
        assert.equal(shell.position, 'absolute');
        assert.equal(shell.top, 0);
        assert.equal((await hero.boundingBox()).y, 0);
        const logoLink = header.getByRole('link', { name: 'FRAME home' });
        await expect(logoLink).toBeVisible();
        const logoBox = await logoLink.boundingBox();
        assert.ok(logoBox.x >= 0 && logoBox.x + logoBox.width <= width);
        assert.ok(await logoLink.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        }));
        if (width >= 1024) {
          assert.ok((await rail.boundingBox()).x + (await rail.boundingBox()).width <= logoBox.x);
          assert.equal(await rail.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
          const home = rail.getByRole('link', { name: 'Home' });
          await home.focus();
          await expect(home).toBeFocused();
          assert.notEqual(
            await home.evaluate(
              (element) => getComputedStyle(element).outlineStyle,
            ),
            'none',
          );
          await expect(
            rail.getByRole('button', { name: /Watchlist/ }),
          ).toBeDisabled();
          await home.blur();
        }
        await page.screenshot({
          path: path.join(evidence, `${width}-hero.png`),
        });
        if ([393, 768, 1440].includes(width)) {
          await page.evaluate(() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'instant',
            }),
          );
          const logo = page.getByRole('img', {
            name: 'TMDB — The Movie Database',
          });
          await expect(logo).toBeVisible();
          await expect
            .poll(() =>
              logo.evaluate(
                (image) => image.complete && image.naturalWidth > 0,
              ),
            )
            .toBe(true);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: 'instant' }),
          );
          await page.screenshot({
            path: path.join(evidence, `${width}-full.png`),
            fullPage: true,
          });
        }
        report.push({
          width,
          status: response.status(),
          metrics: await page.evaluate(() => window.__metrics),
        });
      }
      for (const art of ['charge', 'white', 'sintel', 'spring']) {
        fixture = art;
        for (const width of [393, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(origin + '/movies/1', { waitUntil: 'networkidle' });
          await page.screenshot({ path: path.join(evidence, `${art}-${width}-after.png`) });
          const previous = await page.addStyleTag({ content: `
            section[aria-labelledby="film-title"] > div:nth-child(2) {
              background: linear-gradient(90deg, rgba(16,17,19,.76) 0%, rgba(16,17,19,.92) 30%, rgba(16,17,19,.28) 72%), linear-gradient(0deg, #101113 0%, transparent 48%, rgba(16,17,19,.35) 100%);
            }
            .detail-site-header { background: linear-gradient(rgba(8,10,13,.82), transparent); }
            @media (max-width: 767px) { section[aria-labelledby="film-title"] > div:nth-child(2) { background: linear-gradient(0deg, #101113 20%, rgba(16,17,19,.35) 75%, rgba(16,17,19,.4)); } }
          ` });
          await page.screenshot({ path: path.join(evidence, `${art}-${width}-before.png`) });
          await previous.evaluate((el) => el.remove());
        }
      }
      fixture = 'spring';
      await page.setViewportSize({ width: 393, height: 900 });
      await page.goto(origin + '/movies/2', { waitUntil: 'networkidle' });
      await expect(page.getByText('No TMDB rating available')).toBeVisible();
      await page.screenshot({
        path: path.join(evidence, 'missing-images.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: path.join(evidence, 'missing-backdrop-desktop.png') });
      await page.setViewportSize({ width: 393, height: 900 });
      await page.goto(origin + '/movies/3', { waitUntil: 'networkidle' });
      await page.screenshot({
        path: path.join(evidence, 'long-title.png'),
        fullPage: true,
      });
      await page.route('**/t/p/w185/profile.jpg', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
      await page.goto(origin + '/movies/1', { waitUntil: 'networkidle' });
      await expect(page.getByText('Alex Example')).toBeVisible();
      await expect(
        page.locator('[data-image-unavailable]').last(),
      ).toBeAttached();
      await page.unroute('**/t/p/w185/profile.jpg');
      await page.goto(origin + '/movies/1', { waitUntil: 'networkidle' });
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Skip to content' }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Open navigation' }),
      ).toBeFocused();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addScriptTag({ path: axe });
      const violations = await page.evaluate(async () =>
        (await window.axe.run()).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.html),
        })),
      );
      assert.deepEqual(violations, [], JSON.stringify(violations));
      const slow = await page.goto(origin + '/movies/4', {
        waitUntil: 'commit',
      });
      let loadingSeen = false;
      try {
        await page
          .getByRole('status')
          .waitFor({ state: 'visible', timeout: 700 });
        loadingSeen = true;
      } catch {}
      await expect(
        page.getByRole('heading', { name: 'The Shape of Tomorrow' }),
      ).toBeVisible();
      report.push({ slowStatus: slow.status(), loadingSeen });
      const missing = await page.goto(origin + '/movies/404', {
        waitUntil: 'networkidle',
      });
      await expect(
        page.getByRole('heading', { name: 'Film not found' }),
      ).toBeVisible();
      report.push({
        notFoundStatus: missing.status(),
        robots: await page
          .locator('meta[name="robots"]')
          .first()
          .getAttribute('content')
          .catch(() => null),
      });
      for (const [id, text] of [
        [429, 'This film is temporarily busy'],
        [503, 'Film details are temporarily unavailable'],
      ]) {
        await page.goto(origin + '/movies/' + id);
        await expect(page.getByRole('heading', { name: text })).toBeVisible();
      }
      await page.goto(origin + '/movies/invalid');
      await expect(
        page.getByRole('heading', { name: 'Film not found' }),
      ).toBeVisible();
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(origin + '/movies/3');
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        '200% zoom overflow',
      );
      await page.evaluate(() => { document.body.style.zoom = ''; });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(origin + '/', { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(evidence, 'homepage-hero.png') });
      for (const route of ['/search', '/discover']) {
        await page.goto(origin + route, { waitUntil: 'networkidle' });
        const headerPosition = await page.locator('header').first().evaluate((el) => getComputedStyle(el).position);
        assert.equal(headerPosition, 'relative', `${route} header`);
      }
      await fs.writeFile(
        path.join(evidence, 'summary.json'),
        JSON.stringify({ browser: browser.version(), report }, null, 2),
      );
      console.log('Evidence:', evidence, JSON.stringify(report));
    } finally {
      await browser?.close();
      if (server && server.exitCode === null) server.kill();
      await app.close();
    }
  },
);
