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

for (const nativeOnly of [false, true])
  test(
    nativeOnly
      ? 'production pagination: native navigation without JavaScript'
      : 'production pagination: Search and Discover native page state at seven widths',
    { timeout: nativeOnly ? 90000 : 480000 },
    async () => {
      const { createApp } = apiRequire('./dist/main');
      const { TmdbAdapter } = apiRequire('./dist/catalog/tmdb/tmdb.adapter');
      const app = await createApp();
      const calls = [];
      let rateLimited = true;
      let largeTotals = false;
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
          const count =
            requestedPage > (largeTotals ? 500 : 3)
              ? 0
              : requestedPage === 2
                ? 2
                : 20;
          return Response.json({
            page: requestedPage,
            total_pages: largeTotals ? 500 : 3,
            total_results: largeTotals ? 10000 : 60,
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
      for (const method of [
        'search',
        'discover',
        'genres',
        'imageConfiguration',
      ])
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
        assert.ok(ready, 'Next ready: ' + output.join(''));
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
        const report = {
          widths: [],
          states: [],
          axe: [],
          cls: [],
          enhanced: [],
        };
        const expectPage = async (surface, current, total) => {
          const indicator = surface.getByText(`Page ${current} of ${total}`, {
            exact: true,
          });
          if (surface.viewportSize().width < 768)
            await expect(indicator).toBeVisible();
          else {
            await expect(indicator).toBeHidden();
            await expect(
              surface
                .getByRole('navigation', { name: 'Movie result pages' })
                .locator('[aria-current="page"]:visible'),
            ).toHaveText(String(current));
          }
          await expect(
            surface.getByRole('spinbutton', { name: 'Page', exact: true }),
          ).toHaveAttribute('max', String(total));
        };
        const composition = async () =>
          page
            .getByRole('navigation', { name: 'Movie result pages' })
            .evaluate((nav) => {
              const box = (el) => {
                const r = el.getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height,
                  right: r.right,
                  bottom: r.bottom,
                  center: r.x + r.width / 2,
                };
              };
              const group = nav.firstElementChild,
                form = nav.querySelector('form');
              const children = [...group.children]
                .filter((el) => el.getClientRects().length)
                .map(box);
              const jumpChildren = [...form.children]
                .filter(
                  (el) =>
                    el.getClientRects().length && el.id !== 'movie-page-range',
                )
                .map(box);
              const parent = box(nav),
                navigation = box(group),
                jump = box(form);
              const jumpLeft = Math.min(...jumpChildren.map((r) => r.x)),
                jumpRight = Math.max(...jumpChildren.map((r) => r.right));
              const overlap = children.some((a, i) =>
                children
                  .slice(i + 1)
                  .some(
                    (b) =>
                      Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                      Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
                  ),
              );
              const jumpOverlap = jumpChildren.some((a, i) =>
                jumpChildren
                  .slice(i + 1)
                  .some(
                    (b) =>
                      Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                      Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
                  ),
              );
              const ordered = [...children].sort((a, b) => a.x - b.x);
              const gaps = ordered
                .slice(1)
                .flatMap((r, i) =>
                  Math.abs(r.y - ordered[i].y) < 2
                    ? [r.x - ordered[i].right]
                    : [],
                );
              return {
                parentWidth: parent.width,
                navigationWidth: navigation.width,
                navigationLeftOffset: navigation.x - parent.x,
                jumpRightOffset: parent.right - jump.right,
                zoneGap: jump.x - navigation.right,
                rowOffset: jump.y - navigation.y,
                navigationCenterOffset: navigation.center - parent.center,
                jumpCenterOffset: jump.center - parent.center,
                jumpContentCenterOffset:
                  (jumpLeft + jumpRight) / 2 - parent.center,
                numberCenterOffset:
                  box(
                    [...group.querySelectorAll('ol')].find(
                      (el) => el.getClientRects().length,
                    ) || group,
                  ).center - parent.center,
                verticalGap: jump.y - navigation.bottom,
                maxGap: Math.max(0, ...gaps),
                overlap,
                jumpOverlap,
                indicatorVisible:
                  group.querySelector('p').getClientRects().length > 0,
              };
            });
        if (process.env.FRAME_PAGINATION_LAYOUT_BASELINE === 'true') {
          largeTotals = true;
          rateLimited = false;
          for (const width of [768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const kind of ['search', 'discover'])
              for (const target of [1, 8]) {
                await page.goto(
                  origin +
                    '/' +
                    kind +
                    '?' +
                    (kind === 'search' ? 'q=baseline' : 'sort=rated') +
                    '&page=' +
                    target,
                );
                await expect(
                  page.getByRole('navigation', { name: 'Movie result pages' }),
                ).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                report.enhanced.push({
                  width,
                  kind,
                  target,
                  ...(await composition()),
                });
              }
          }
          assert.deepEqual(errors, []);
          await fs.writeFile(
            path.join(evidence, 'before-layout.json'),
            JSON.stringify(report, null, 2),
          );
          return;
        }
        if (!nativeOnly) {
          for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const kind of ['search', 'discover']) {
              largeTotals = false;
              const tuple =
                kind === 'search'
                  ? 'q=Am%C3%A9lie+%26+%E6%9D%B1%E4%BA%AC'
                  : 'genreId=18&yearFrom=1990&yearTo=1999&sort=rated';
              const base = origin + '/' + kind + '?' + tuple;
              rateLimited = false;
              const before = calls.filter((c) =>
                c.startsWith(
                  '/3/' +
                    (kind === 'search' ? 'search/movie' : 'discover/movie'),
                ),
              ).length;
              await page.goto(base + '&page=2');
              await expectPage(page, 2, 3);
              await expect(page.locator('.movie-card')).toHaveCount(2);
              const next = page.getByRole('link', {
                name: 'Next',
                exact: true,
              });
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
                    '/3/' +
                      (kind === 'search' ? 'search/movie' : 'discover/movie'),
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
              await expectPage(opened, 3, 3);
              await opened.close();
              await next.focus();
              await expect(next).toBeFocused();
              await page.keyboard.press('Enter');
              await expectPage(page, 3, 3);
              await expect(page.locator('.movie-card')).toHaveCount(20);
              await expect(
                page.getByRole('link', { name: 'Next', exact: true }),
              ).toHaveCount(0);
              await page.goBack();
              await expect(page).toHaveURL(base + '&page=2');
              await expectPage(page, 2, 3);
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
              await expectPage(page, 3, 3);
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
              await expectPage(page, 3, 3);
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
              await expectPage(page, 2, 3);
              await page
                .getByRole('link', { name: 'Next', exact: true })
                .click();
              await expectPage(page, 3, 3);
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
              await expectPage(page, 1, 3);
              assert.equal(new URL(page.url()).searchParams.has('page'), false);
              rateLimited = true;
              await page.goto(base + '&page=3');
              await expect(
                page.getByRole('button', { name: 'Try again' }),
              ).toBeVisible();
              rateLimited = false;
              await page.getByRole('button', { name: 'Try again' }).click();
              await expectPage(page, 3, 3);
              assert.equal(new URL(page.url()).searchParams.get('page'), '3');
              await page.goto(base + '&page=4');
              await expect(
                page.getByRole('link', { name: 'Return to page 1' }),
              ).toBeVisible();
              await page
                .getByRole('link', { name: 'Return to page 1' })
                .click();
              await expectPage(page, 1, 3);
              for (const invalid of [
                '501',
                '01',
                '2&page=2',
                '-1',
                '2.5',
                'abc',
                '1e2',
              ]) {
                await page.goto(base + '&page=' + invalid);
                await expect(
                  page.getByText(
                    kind === 'search'
                      ? 'Check your search'
                      : 'Check your filters',
                    { exact: true },
                  ),
                ).toBeVisible();
              }
              await page.emulateMedia({ reducedMotion: 'reduce' });
              await page.goto(base + '&page=2');
              await expectPage(page, 2, 3);
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
                await expectPage(page, 1, 3);
                assert.equal(new URL(page.url()).search, '');
              }
              // Separate large-total fixture preserves the original sparse/429 cases.
              largeTotals = true;
              for (const target of [1, 8, 250, 500]) {
                await page.goto(base + '&page=' + target);
                await expectPage(page, target, 500);
                const nav = page.getByRole('navigation', {
                  name: 'Movie result pages',
                });
                const jump = nav.getByRole('spinbutton', {
                  name: 'Page',
                  exact: true,
                });
                await expect(jump).toHaveValue(String(target));
                await expect(
                  nav.getByText('Previous', { exact: true }),
                ).toHaveCount(target === 1 ? 0 : 1);
                await expect(
                  nav.getByText('Next', { exact: true }),
                ).toHaveCount(target === 500 ? 0 : 1);
                await expect(jump).toHaveAccessibleDescription(
                  'Enter a whole page from 1 to 500.',
                );
                await page.mouse.move(0, 0);
                const geometry = await nav.evaluate((el) => {
                  const visible = [
                    ...el.querySelectorAll('a,input[type="number"],button'),
                  ].filter((e) => e.getClientRects().length);
                  return {
                    overflow:
                      document.documentElement.scrollWidth >
                      document.documentElement.clientWidth,
                    targets: visible.map((e) => ({
                      width: e.getBoundingClientRect().width,
                      height: e.getBoundingClientRect().height,
                    })),
                    active: [
                      ...el.querySelectorAll('[aria-current="page"]'),
                    ].filter((e) => e.getClientRects().length).length,
                    pages: visible
                      .filter((e) =>
                        e.getAttribute('aria-label')?.startsWith('Page '),
                      )
                      .map((e) => e.getAttribute('aria-label')),
                    styles: visible
                      .filter((e) => e.tagName === 'A')
                      .map((e) => ({
                        decoration: getComputedStyle(e).textDecorationLine,
                        background: getComputedStyle(e).backgroundColor,
                        border: getComputedStyle(e).borderTopWidth,
                      })),
                  };
                });
                assert.equal(geometry.overflow, false);
                assert.ok(
                  geometry.targets.every(
                    (t) => t.width >= 48 && t.height >= 48,
                  ),
                );
                assert.equal(geometry.active, width < 768 ? 0 : 1);
                assert.ok(
                  geometry.styles.every(
                    (s) =>
                      s.decoration === 'none' &&
                      s.background === 'rgba(0, 0, 0, 0)' &&
                      s.border === '0px',
                  ),
                );
                if (width < 768) assert.deepEqual(geometry.pages, []);
                await expect(
                  nav.getByRole('link', { name: /^Page \d+$/ }),
                ).toHaveCount(geometry.pages.length);
                if (target === 8 && width >= 768) {
                  assert.equal(
                    geometry.pages.includes('Page 6'),
                    width >= 1024,
                  );
                  const link = nav.getByRole('link', {
                    name: 'Page 9',
                    exact: true,
                  });
                  await link.focus();
                  assert.equal(
                    await link.evaluate(
                      (e) => getComputedStyle(e).outlineStyle,
                    ),
                    'solid',
                  );
                  await page.keyboard.press('Enter');
                  await expectPage(page, 9, 500);
                  await page.goto(base + '&page=' + target);
                  await expectPage(page, target, 500);
                }
                await jump.focus();
                assert.equal(
                  await jump.evaluate((e) => getComputedStyle(e).outlineStyle),
                  'solid',
                );
                await page.keyboard.press('Tab');
                await expect(
                  nav.getByRole('button', { name: 'Go', exact: true }),
                ).toBeFocused();
                await page.keyboard.press('Shift+Tab');
                await expect(jump).toBeFocused();
                const layout = await composition();
                if (width >= 1280) {
                  assert.ok(Math.abs(layout.navigationLeftOffset) < 2);
                  assert.ok(Math.abs(layout.jumpRightOffset) < 2);
                  assert.ok(Math.abs(layout.rowOffset) < 2);
                  assert.ok(layout.zoneGap >= 32);
                } else {
                  assert.ok(Math.abs(layout.navigationCenterOffset) < 2);
                  assert.ok(Math.abs(layout.jumpCenterOffset) < 2);
                  assert.ok(Math.abs(layout.jumpContentCenterOffset) < 2);
                  assert.ok(
                    layout.verticalGap >= 8 && layout.verticalGap <= 32,
                  );
                }
                assert.equal(layout.overlap, false);
                assert.equal(layout.jumpOverlap, false);
                assert.equal(layout.indicatorVisible, width < 768);
                if (width >= 768) {
                  assert.ok(layout.navigationWidth < layout.parentWidth * 0.9);
                  assert.ok(layout.maxGap <= 24);
                }
                report.enhanced.push({
                  width,
                  kind,
                  target,
                  ...geometry,
                  composition: layout,
                });
                if (width === 1440 && [1, 8, 500].includes(target)) {
                  await nav.scrollIntoViewIfNeeded();
                  await page.screenshot({
                    path: path.join(
                      evidence,
                      `${kind}-1440-${target === 1 ? 'first' : target === 500 ? 'last' : 'middle'}.png`,
                    ),
                  });
                }
              }
              // Unsubmitted top-form edits must not leak into jump's applied tuple.
              if (kind === 'search')
                await page.getByRole('searchbox').fill('unsubmitted title');
              else
                await page
                  .getByLabel('From year', { exact: true })
                  .fill('2002');
              const jump = page.getByRole('spinbutton', {
                name: 'Page',
                exact: true,
              });
              for (const value of ['', '0', '-1', '501', '2.5']) {
                await jump.fill(value);
                const before = page.url();
                await page
                  .getByRole('button', { name: 'Go', exact: true })
                  .click();
                assert.equal(page.url(), before);
                assert.equal(
                  await jump.evaluate((e) => e.validity.valid),
                  false,
                );
                assert.ok(
                  await jump.evaluate((e) => e.validationMessage.length > 0),
                );
              }
              await jump.fill('8');
              await jump.press('Enter');
              await expectPage(page, 8, 500);
              const applied = new URL(page.url()).searchParams;
              for (const [name, value] of new URLSearchParams(tuple))
                assert.deepEqual(applied.getAll(name), [value]);
              assert.deepEqual(applied.getAll('page'), ['8']);
              await page.goBack();
              await expectPage(page, 500, 500);
              await page.goForward();
              await expectPage(page, 8, 500);
              await page.reload();
              await expectPage(page, 8, 500);
              await page
                .getByRole('spinbutton', { name: 'Page', exact: true })
                .fill('1');
              await page
                .getByRole('button', { name: 'Go', exact: true })
                .click();
              await expectPage(page, 1, 500);
              assert.equal(new URL(page.url()).searchParams.get('page'), '1');
              // Numeric syntax that passes native constraints still goes through strict route validation.
              for (const value of ['1e2', '01', '1.0']) {
                const input = page.getByRole('spinbutton', {
                  name: 'Page',
                  exact: true,
                });
                await input.fill(value);
                const serialized = await input.inputValue();
                assert.ok(
                  ['1e2', '01', '1.0', '100', '1'].includes(serialized),
                );
                await input.press('Enter');
                if (
                  /^[1-9][0-9]*$/.test(serialized) &&
                  !serialized.startsWith('0')
                ) {
                  await expectPage(page, serialized, 500);
                } else {
                  await expect(
                    page.getByText(
                      kind === 'search'
                        ? 'Check your search'
                        : 'Check your filters',
                      { exact: true },
                    ),
                  ).toBeVisible();
                }
                await page.goto(base + '&page=8');
              }
              // A previously valid jump target may become unavailable as totals shrink.
              largeTotals = false;
              await page
                .getByRole('button', { name: 'Go', exact: true })
                .click();
              await expect(
                page.getByRole('link', { name: 'Return to page 1' }),
              ).toBeVisible();
              assert.equal(new URL(page.url()).searchParams.get('page'), '8');
              largeTotals = true;
              await page.goto(base + '&page=8');
              await page.addScriptTag({ path: axePath });
              const enhancedAxe = await page.evaluate(async () =>
                (await axe.run()).violations.map((v) => v.id),
              );
              assert.deepEqual(enhancedAxe, []);
              report.axe.push({
                width,
                kind,
                state: 'large-pagination',
                violations: enhancedAxe,
              });
              await page
                .getByRole('navigation', { name: 'Movie result pages' })
                .scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(evidence, `${kind}-${width}-numbered.png`),
              });
            }
            report.widths.push(width);
          }
        }
        if (nativeOnly) {
          largeTotals = true;
          rateLimited = false;
          const noScript = await browser.newContext({
            javaScriptEnabled: false,
            viewport: { width: 1440, height: 900 },
          });
          try {
            await noScript.route('https://image.tmdb.org/**', (route) =>
              route.abort(),
            );
            const native = await noScript.newPage();
            report.noJavaScript = [];
            for (const kind of ['search', 'discover']) {
              const tuple =
                kind === 'search' ? 'q=native' : 'genreId=18&sort=rated';
              try {
                await native.goto(
                  origin + '/' + kind + '?' + tuple + '&page=8',
                );
                await expectPage(native, 8, 500);
                await native
                  .getByRole('spinbutton', { name: 'Page', exact: true })
                  .fill('55');
                await native
                  .getByRole('button', { name: 'Go', exact: true })
                  .click();
                await expectPage(native, 55, 500);
                const applied = new URL(native.url()).searchParams;
                assert.deepEqual(applied.getAll('page'), ['55']);
                for (const [name, value] of new URLSearchParams(tuple))
                  assert.deepEqual(applied.getAll(name), [value]);
                await native
                  .getByRole('link', { name: 'Next', exact: true })
                  .click();
                await expectPage(native, 56, 500);
                report.noJavaScript.push({ kind, jump: 55, next: 56 });
              } catch (error) {
                const nav = native.getByRole('navigation', {
                  name: 'Movie result pages',
                });
                report.noJavaScript.push({
                  kind,
                  error: error.message,
                  navigationVisible: await nav.isVisible(),
                  streamedNavigationCount: await native
                    .locator('nav[aria-label="Movie result pages"]')
                    .count(),
                });
                await native.screenshot({
                  path: path.join(evidence, `${kind}-no-javascript.png`),
                  fullPage: true,
                });
                await fs.writeFile(
                  path.join(evidence, `${kind}-no-javascript.html`),
                  await native.content(),
                );
              }
            }
          } finally {
            await noScript.close();
          }
        }
        assert.equal(
          calls.some((c) => /movie\/\d+/.test(c)),
          false,
        );
        assert.deepEqual(errors, []);
        await fs.writeFile(
          path.join(
            evidence,
            nativeOnly ? 'no-javascript.json' : 'summary.json',
          ),
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
        if (nativeOnly)
          assert.deepEqual(
            report.noJavaScript
              .filter((result) => result.error)
              .map((result) => result.kind),
            [],
            'Native navigation must remain available without JavaScript',
          );
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
