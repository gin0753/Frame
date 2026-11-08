// Supplementary synthetic lab evidence. Reuses Discover's owned Next/Nest harness.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { provenance, sessionCLS } = require('./stage44-evidence.cjs');

function observe() {
  const data = (window.__stage44 = {
    lcp: [],
    shifts: [],
    supported: PerformanceObserver.supportedEntryTypes,
  });
  window.__stage44Observers = [];
  for (const type of ['largest-contentful-paint', 'layout-shift']) {
    const append = (entries) => {
      for (const e of entries) {
        if (type === 'layout-shift')
          data.shifts.push({
            startTime: e.startTime,
            value: e.value,
            hadRecentInput: e.hadRecentInput,
          });
        else
          data.lcp.push({
            startTime: e.startTime,
            loadTime: e.loadTime,
            renderTime: e.renderTime,
            size: e.size,
            url: e.url,
            element: e.element?.outerHTML.slice(0, 800),
          });
      }
    };
    if (!data.supported.includes(type)) continue;
    const observer = new PerformanceObserver((list) =>
      append(list.getEntries()),
    );
    observer.observe({ type, buffered: true });
    window.__stage44Observers.push(() => append(observer.takeRecords()));
  }
}

module.exports = async function performanceEvidence({
  browser,
  origin,
  evidence,
  calls,
  setMode,
  setDictionary,
}) {
  const report = {
    provenance: provenance(__filename, browser),
    definitions: {
      lcp: 'Last observed LCP entry after fonts and visible artwork settle; synthetic lab only',
      cls: 'Maximum non-recent-input session window, 1s gap/5s duration',
      navigation:
        'Monotonic wall time from navigation initiation; document response and visible final result measured separately',
      cold: 'New browser context; normal motion, DPR1, no CPU/network throttle',
      warm: 'Same context page 2 to page 3 document navigation',
      thresholds: {
        lcpDiagnosticMs: 2500,
        clsDiagnostic: 0.1,
        navigation: 'No acceptance threshold',
      },
    },
    samples: [],
    failures: [],
    verdict: 'INCONCLUSIVE',
  };
  const movieCalls = () =>
    calls.filter((c) => /^\/3\/(search|discover)\/movie/.test(c));
  async function open(width, artwork = 'normal') {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(observe);
    await page.route('https://image.tmdb.org/**', async (route) => {
      if (artwork === 'failed') return route.abort();
      if (artwork === 'delayed') await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({
        path: path.join(
          __dirname,
          '../../apps/web/public/images/films/spring-poster.webp',
        ),
        contentType: 'image/webp',
      });
    });
    return { page, context, errors };
  }
  async function sample(page, route, width, kind, index, errors) {
    const before = movieCalls().length,
      allBefore = calls.length;
    const started = performance.now();
    const response = await page.goto(origin + route, { waitUntil: 'commit' });
    const responseMs = performance.now() - started;
    if (kind === 'slow-movies')
      await expect(page.getByRole('status')).toHaveText('Loading films…');
    if (kind === 'slow-dictionary')
      await expect(page.getByLabel('Genre', { exact: true })).toBeDisabled();
    if (route !== '/search') {
      await expect(page.locator('.movie-card')).toHaveCount(20);
      await expect(page.locator('.movie-card').first()).toBeVisible();
    } else
      await expect(page.getByText('Enter a title to begin.')).toBeVisible();
    const resultVisibleMs = performance.now() - started;
    if (kind === 'slow-dictionary')
      await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.top < innerHeight && r.bottom > 0;
          })
          .map((i) => i.decode().catch(() => {})),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    // LCP delivery can lag image decode/compositor paint. Observe a bounded quiet
    // window after settlement; entry timestamps remain the browser's timestamps.
    await page.waitForTimeout(250);
    const raw = await page.evaluate(() => {
      window.__stage44Observers.forEach((drain) => drain());
      return {
        ...window.__stage44,
        navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
        resources: performance
          .getEntriesByType('resource')
          .filter((r) => /woff|synthetic|poster/.test(r.name))
          .map((r) => r.toJSON()),
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    const count = movieCalls().length - before;
    assert.equal(response.status(), 200);
    assert.equal(count, route === '/search' ? 0 : 1);
    assert.equal(raw.overflow, false);
    assert.deepEqual(errors, []);
    assert.equal(
      calls.slice(allBefore).some((c) => /^\/3\/movie\/\d/.test(c)),
      false,
    );
    const lcp = raw.lcp.at(-1) ?? null,
      cls = sessionCLS(raw.shifts);
    const item = {
      width,
      kind,
      index,
      route,
      url: page.url(),
      responseMs,
      resultVisibleMs,
      movieCalls: movieCalls().slice(before),
      providerCalls: calls.slice(allBefore),
      errors: [...errors],
      raw,
      lcp,
      cls,
      lcpDiagnostic: lcp
        ? lcp.startTime <= 2500
          ? 'PASS'
          : 'FAIL'
        : 'NOT VERIFIED',
      clsDiagnostic: raw.supported.includes('layout-shift')
        ? cls <= 0.1
          ? 'PASS'
          : 'FAIL'
        : 'NOT SUPPORTED',
    };
    report.samples.push(item);
    return item;
  }
  try {
    for (const width of [393, 1440]) {
      for (const route of [
        '/search',
        '/search?q=full',
        '/discover',
        '/discover?genreId=18&yearFrom=1990&yearTo=1999&sort=rated',
      ]) {
        for (let index = 0; index < 5; index++) {
          setMode('full');
          setDictionary('normal');
          const { page, context, errors } = await open(width);
          try {
            await sample(page, route, width, 'cold', index, errors);
          } finally {
            await context.close();
          }
        }
      }
      for (const base of [
        '/search?q=full',
        '/discover?genreId=18&sort=rated',
      ]) {
        for (let index = 0; index < 5; index++) {
          const { page, context, errors } = await open(width);
          try {
            await page.goto(origin + base + '&page=2');
            await expect(
              page.locator(
                '.movie-card a[href="https://www.themoviedb.org/movie/201"]',
              ),
            ).toBeVisible();
            const before = movieCalls().length,
              started = performance.now();
            const responsePromise = page.waitForResponse(
              (r) =>
                r.request().isNavigationRequest() && r.url().includes('page=3'),
            );
            await page
              .getByRole('link', { name: 'Next', exact: true })
              .click({ noWaitAfter: true });
            await responsePromise;
            const responseMs = performance.now() - started;
            await expect(page).toHaveURL(/page=3/);
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
            const requested = movieCalls().slice(before);
            assert.equal(requested.length, 1);
            assert.equal(
              new URL(requested[0], origin).searchParams.get('page'),
              '3',
            );
            assert.deepEqual(errors, []);
            report.samples.push({
              width,
              kind: 'warm-pagination',
              index,
              route: base,
              url: page.url(),
              responseMs,
              resultVisibleMs: performance.now() - started,
              movieCalls: requested,
              errors,
            });
          } finally {
            await context.close();
          }
        }
      }
      for (const kind of [
        'slow-dictionary',
        'slow-movies',
        'delayed-artwork',
        'failed-artwork',
      ]) {
        setMode(kind === 'slow-movies' ? 'slow' : 'full');
        setDictionary(kind === 'slow-dictionary' ? 'slow' : 'normal');
        const { page, context, errors } = await open(
          width,
          kind === 'delayed-artwork'
            ? 'delayed'
            : kind === 'failed-artwork'
              ? 'failed'
              : 'normal',
        );
        try {
          const item = await sample(page, '/discover', width, kind, 0, errors);
          item.posterGeometry = await page
            .locator('.movie-card:visible .movie-image')
            .first()
            .boundingBox();
          assert.ok(
            Math.abs(
              item.posterGeometry.height / item.posterGeometry.width - 1.5,
            ) < 0.02,
          );
          if (kind === 'failed-artwork')
            await expect(
              page.locator('.movie-card [data-image-unavailable]').first(),
            ).toBeVisible();
          await page.screenshot({
            path: path.join(evidence, `performance-${width}-${kind}.png`),
            fullPage: true,
          });
        } finally {
          await context.close();
        }
      }
    }
    assert.equal(
      calls.some((c) => /^\/3\/movie\/\d/.test(c)),
      false,
    );
    report.verdict = 'PASS execution; diagnostic metrics reported separately';
  } catch (error) {
    report.failures.push(error.stack);
    report.verdict = 'FAIL';
    throw error;
  } finally {
    await fs.writeFile(
      path.join(evidence, 'performance-raw.json'),
      JSON.stringify(report, null, 2),
    );
    console.log('Stage 4.4 supplementary evidence:', evidence);
  }
};
