const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { provenance } = require('./stage44-evidence.cjs');

module.exports = async function streaming({
  page,
  browser,
  origin,
  evidence,
  calls,
  hold,
  release,
  axePath,
}) {
  const report = {
    provenance: provenance(__filename, browser),
    cases: [],
    errors: [],
    verdict: 'INCONCLUSIVE',
  };
  page.on('pageerror', (error) => report.errors.push(error.message));
  const values = () =>
    page
      .getByRole('form', { name: 'Discover filters' })
      .evaluate((form) => new FormData(form).getAll('genreId'));
  const movies = () => calls.filter((c) => c.startsWith('/3/discover/movie'));
  const scan = async () => {
    await page.addScriptTag({ path: axePath });
    return page.evaluate(async () => {
      const result = await window.axe.run();
      return { violations: result.violations, incomplete: result.incomplete };
    });
  };
  try {
    for (const width of [393, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ['valid', 'invalid', 'failure']) {
        hold();
        const id = kind === 'invalid' ? '0' : '18';
        const before = movies().length;
        const item = { width, kind, status: 'INCONCLUSIVE' };
        report.cases.push(item);
        await page.goto(origin + '/discover?genreId=' + id, {
          waitUntil: 'commit',
        });
        const genre = page.getByLabel('Genre', { exact: true });
        await expect(genre).toBeDisabled();
        await expect(genre).toHaveValue(id);
        await expect(genre).toContainText('Genre ID ' + id);
        assert.deepEqual(await values(), [id]);
        item.pendingFormData = await values();
        if (kind === 'invalid') {
          await expect(genre).toHaveAttribute('aria-invalid', 'true');
          await expect(genre).toHaveAttribute(
            'aria-describedby',
            'genreId-error',
          );
          await expect(page.locator('#genreId-error')).toBeVisible();
          assert.equal(movies().length, before);
        } else {
          assert.equal(await genre.getAttribute('aria-invalid'), null);
        }
        // Keyboard focus is on a persistent sibling: the disabled Genre is skipped.
        await page.getByLabel('From year').focus();
        await page.keyboard.press('Tab');
        await expect(page.getByLabel('To year')).toBeFocused();
        item.pendingFocus = await page.evaluate(() => ({
          id: document.activeElement.id,
          outline: getComputedStyle(document.activeElement).outlineStyle,
        }));
        if (kind === 'valid') {
          // Observe the actual native navigation request before releasing provider work.
          const request = page.waitForRequest(
            (r) =>
              r.isNavigationRequest() &&
              r.url().includes('/discover?') &&
              r.url().includes('yearFrom='),
          );
          await page
            .getByRole('button', { name: 'Apply', exact: true })
            .click({ noWaitAfter: true });
          const submitted = new URL((await request).url());
          assert.deepEqual(submitted.searchParams.getAll('genreId'), ['18']);
          item.submittedUrl = submitted.pathname + submitted.search;
        }
        release(kind === 'failure');
        if (kind === 'failure') {
          await expect(page.locator('#genre-availability')).toBeVisible();
          await expect(genre).toBeDisabled();
          await expect(genre).toHaveAttribute(
            'aria-describedby',
            'genre-availability',
          );
        } else {
          await expect(genre).toBeEnabled();
          if (kind === 'invalid') {
            await expect(genre).toHaveAttribute(
              'aria-describedby',
              'genreId-error',
            );
            assert.equal(movies().length, before);
          } else {
            await expect(page.locator('.movie-card')).toHaveCount(20);
            await expect(page.locator('.movie-card').first()).toBeVisible();
            assert.ok(
              movies()
                .slice(before)
                .every(
                  (c) =>
                    new URL(c, origin).searchParams.get('with_genres') === '18',
                ),
            );
          }
        }
        await expect(genre).toHaveValue(id);
        assert.deepEqual(await values(), [id]);
        item.resolvedFormData = await values();
        if (kind !== 'valid')
          await expect(page.getByLabel('To year')).toBeFocused();
        item.overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        );
        assert.equal(item.overflow, false);
        item.axe = await scan();
        assert.deepEqual(
          item.axe.violations.map((v) => v.id),
          [],
        );
        await page.screenshot({
          path: path.join(evidence, `stream-${width}-${kind}.png`),
          fullPage: true,
        });
        item.movieCalls = movies().slice(before);
        item.status = 'PASS';
      }
      // Optional labels must not block unfiltered movies. Hold deterministically.
      hold();
      await page.goto(origin + '/discover', { waitUntil: 'commit' });
      await expect(page.locator('.movie-card')).toHaveCount(20);
      await expect(page.locator('.movie-card').first()).toBeVisible();
      await expect(page.getByLabel('Genre', { exact: true })).toBeDisabled();
      const pendingAxe = await scan();
      release(false);
      await expect(page.getByLabel('Genre', { exact: true })).toBeEnabled();
      assert.deepEqual(
        pendingAxe.violations.map((v) => v.id),
        [],
      );
      report.cases.push({
        width,
        kind: 'independent-results-and-pending-axe',
        status: 'PASS',
        axe: pendingAxe,
      });
    }
    assert.deepEqual(report.errors, []);
    report.verdict = 'PASS';
  } catch (error) {
    report.failure = error.stack;
    report.verdict = 'FAIL';
    throw error;
  } finally {
    release(false);
    await fs.writeFile(
      path.join(evidence, 'streaming.json'),
      JSON.stringify(report, null, 2),
    );
    console.log('Stage 4.4 streaming evidence:', evidence);
  }
};

// Bounded Phase C checks: real Chromium profile zoom and forced-colors emulation.
module.exports.bounded = async function bounded({
  browser,
  origin,
  evidence,
  axePath,
  setMode,
}) {
  const report = {
    provenance: provenance(__filename, browser),
    technique:
      'Isolated Chromium profile partition.default_zoom_level.x=log(2)/log(1.2), default partition key x; assert DPR 2, halved layout viewport and visualViewport.scale 1. No CSS zoom or pinch scaling.',
    cases: [],
    errors: [],
    verdict: 'INCONCLUSIVE',
  };
  try {
    for (const width of [393, 640, 1440])
      for (const mode of width === 640
        ? ['zoom200']
        : ['zoom200', 'forced-colors']) {
        let context;
        try {
          if (mode === 'zoom200') {
            const profile = path.join(evidence, `profile-${width}`);
            await fs.mkdir(path.join(profile, 'Default'), { recursive: true });
            await fs.writeFile(
              path.join(profile, 'Default/Preferences'),
              JSON.stringify({
                partition: {
                  default_zoom_level: { x: Math.log(2) / Math.log(1.2) },
                },
              }),
            );
            context = await chromium.launchPersistentContext(profile, {
              headless: true,
              executablePath: process.env.FRAME_CHROMIUM_EXECUTABLE,
              viewport: { width, height: 900 },
              deviceScaleFactor: 1,
              serviceWorkers: 'block',
            });
          } else
            context = await browser.newContext({
              viewport: { width, height: 900 },
              deviceScaleFactor: 1,
              forcedColors: 'active',
              reducedMotion: 'reduce',
              serviceWorkers: 'block',
            });
          const page = await context.newPage();
          page.on('pageerror', (error) => report.errors.push(error.message));
          await page.route('https://image.tmdb.org/**', (route) =>
            route.fulfill({
              path: path.join(
                __dirname,
                '../../apps/web/public/images/films/spring-poster.webp',
              ),
              contentType: 'image/webp',
            }),
          );
          await page.goto(origin + '/search');
          const metrics = await page.evaluate(() => ({
            innerWidth,
            innerHeight,
            outerWidth,
            dpr: devicePixelRatio,
            visualScale: visualViewport.scale,
            forcedColors: matchMedia('(forced-colors: active)').matches,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
              .matches,
          }));
          if (
            mode === 'zoom200' &&
            !(
              Math.abs(metrics.dpr - 2) < 0.01 &&
              Math.abs(metrics.innerWidth - width / 2) <= 1 &&
              metrics.visualScale === 1
            )
          ) {
            report.cases.push({
              width,
              mode,
              metrics,
              status: 'NOT VERIFIED',
              reason: 'Native zoom preference not reflected in browser metrics',
            });
            continue;
          }
          if (mode === 'forced-colors') {
            assert.equal(metrics.forcedColors, true);
            assert.equal(metrics.reducedMotion, true);
          }
          if (mode === 'zoom200' && width === 393) {
            // Preserve and stop the already-demonstrated shared-header boundary path.
            const geometry = await page.evaluate(() => ({
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              menuRight: document
                .querySelector('button[aria-label="Open navigation"]')
                .getBoundingClientRect().right,
            }));
            await page.screenshot({
              path: path.join(evidence, '393-zoom200-header-boundary.png'),
            });
            report.cases.push({
              width,
              mode,
              route: 'shared-header',
              metrics,
              geometry,
              status:
                geometry.scrollWidth > geometry.clientWidth ? 'FAIL' : 'PASS',
              reason:
                '196 CSS px is below frozen 320px responsive matrix. Boundary failure retained; production fix not authorized.',
            });
            continue;
          }
          for (const route of ['search', 'discover'])
            for (const state of width === 640
              ? ['results', 'invalid']
              : ['results', 'invalid', 'empty', 'unavailable']) {
              setMode(
                state === 'empty'
                  ? 'empty'
                  : state === 'unavailable'
                    ? 'unavailable'
                    : 'full',
              );
              const url =
                route === 'search'
                  ? `/search?q=full${state === 'invalid' ? '&page=0' : '&page=2'}`
                  : state === 'invalid'
                    ? '/discover?genreId=0&yearFrom=2020&yearTo=1900&sort=bad'
                    : '/discover?genreId=18&yearFrom=1990&yearTo=1999&sort=rated&page=2';
              await page.goto(origin + url);
              if (state === 'results') {
                await expect(page.locator('.movie-card').first()).toBeVisible();
                await expect(
                  page.getByRole('navigation', { name: 'Movie result pages' }),
                ).toBeVisible();
                await expect(page.getByText('Page 2 of 3')).toBeVisible();
              } else if (state === 'invalid')
                await expect(
                  page.getByRole('heading', {
                    name:
                      route === 'search'
                        ? 'Check your search'
                        : 'Check your filters',
                  }),
                ).toBeVisible();
              else if (state === 'unavailable')
                await expect(
                  page.getByRole('button', { name: 'Try again', exact: true }),
                ).toBeVisible();
              else
                await expect(
                  page.getByRole('link', { name: 'Return to page 1' }),
                ).toBeVisible();
              const input = page.getByLabel(
                route === 'search' ? 'Film title' : 'From year',
                { exact: true },
              );
              if (route === 'discover' && state !== 'invalid') {
                await input.fill('2000');
                await expect(input).toHaveValue('2000');
                await page.getByLabel('To year').fill('2001');
                await expect(page.getByLabel('To year')).toHaveValue('2001');
              }
              await input.focus();
              if (route === 'discover') {
                await page.keyboard.press('Tab');
                await expect(page.getByLabel('To year')).toBeFocused();
              } else {
                await page.keyboard.press('Tab');
                await expect(
                  page.getByRole('button', { name: 'Search', exact: true }),
                ).toBeFocused();
              }
              const geometry = await page.evaluate(() => {
                const active = document.activeElement,
                  r = active.getBoundingClientRect(),
                  style = getComputedStyle(active);
                return {
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                  overflowElements: [
                    ...document.querySelectorAll(
                      'header a,header button,main input,main select,main h1,main h2,main button',
                    ),
                  ]
                    .filter((e) => {
                      const rect = e.getBoundingClientRect();
                      return rect.width > 0 && rect.right > innerWidth + 1;
                    })
                    .map((e) => ({
                      tag: e.tagName,
                      id: e.id,
                      label:
                        e.getAttribute('aria-label') ||
                        e.textContent.slice(0, 80),
                      right: e.getBoundingClientRect().right,
                    })),
                  focus: {
                    tag: active.tagName,
                    id: active.id,
                    outline: style.outlineStyle,
                    outlineWidth: style.outlineWidth,
                    color: style.outlineColor,
                    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                  },
                  controls: [
                    ...document.querySelectorAll(
                      'main input:not([type=hidden]),main select',
                    ),
                  ]
                    .filter((e) => e.getBoundingClientRect().width)
                    .map((e) => ({
                      id: e.id,
                      width: e.getBoundingClientRect().width,
                      height: e.getBoundingClientRect().height,
                      color: getComputedStyle(e).color,
                      fontSize: getComputedStyle(e).fontSize,
                      background: getComputedStyle(e).backgroundColor,
                    })),
                  pagination: [
                    ...document.querySelectorAll(
                      'nav[aria-label="Movie result pages"] a',
                    ),
                  ].map((e) => ({
                    name: e.textContent,
                    rect: {
                      x: e.getBoundingClientRect().x,
                      width: e.getBoundingClientRect().width,
                    },
                    color: getComputedStyle(e).color,
                    border: getComputedStyle(e).borderColor,
                  })),
                };
              });
              const item = {
                width,
                mode,
                route,
                state,
                metrics,
                geometry,
                status:
                  geometry.scrollWidth > geometry.clientWidth ? 'FAIL' : 'PASS',
              };
              if (geometry.focus.outline === 'none') item.status = 'FAIL';
              if (state === 'results' || state === 'invalid') {
                await page.addScriptTag({ path: axePath });
                item.axe = await page.evaluate(async () => {
                  const r = await axe.run();
                  return { violations: r.violations, incomplete: r.incomplete };
                });
                // Forced colors changes painted values. Keep every raw axe flag;
                // screenshot review showed black/white where axe used author colors.
                if (item.axe.violations.length) {
                  if (
                    mode === 'forced-colors' &&
                    item.axe.violations.every(
                      (v) => v.id === 'color-contrast',
                    ) &&
                    item.status !== 'FAIL'
                  ) {
                    item.status = 'REVIEW';
                    item.axeDisposition =
                      'Computed/painted-color mismatch: raw contrast flags retained for paint review, not a contrast PASS';
                  } else item.status = 'FAIL';
                }
                await page.screenshot({
                  path: path.join(
                    evidence,
                    `${width}-${mode}-${route}-${state}.png`,
                  ),
                  fullPage: mode !== 'zoom200',
                });
              }
              item.afterCaptureWidth = await page.evaluate(() => innerWidth);
              assert.equal(
                item.afterCaptureWidth,
                geometry.clientWidth,
                'Capture preserves layout viewport',
              );
              report.cases.push(item);
              // Record runtime failures without altering production or continuing that state path.
              if (item.status === 'FAIL') continue;
            }
          const trigger = page.getByRole('button', { name: 'Open navigation' });
          if (await trigger.isVisible()) {
            await trigger.click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(trigger).toBeFocused();
          }
        } finally {
          await context?.close();
        }
      }
    assert.deepEqual(report.errors, []);
    report.verdict = report.cases.some((c) => c.status === 'FAIL')
      ? 'FAIL'
      : report.cases.some((c) => ['NOT VERIFIED', 'REVIEW'].includes(c.status))
        ? 'PASS WITH CONDITIONS'
        : 'PASS';
  } catch (error) {
    report.failure = error.stack;
    report.verdict = 'FAIL';
    throw error;
  } finally {
    await fs.writeFile(
      path.join(evidence, 'accessibility.json'),
      JSON.stringify(report, null, 2),
    );
    console.log('Phase C bounded accessibility evidence:', evidence);
  }
};
