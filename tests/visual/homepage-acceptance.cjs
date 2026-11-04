// Opt-in Stage 3.4B checks over the existing real Next/Nest transport fixture.
// Synthetic evidence only: no real provider responses or images are retained.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const lintRequire = createRequire(webRequire.resolve('eslint-config-next'));
const a11yRequire = createRequire(
  lintRequire.resolve('eslint-plugin-jsx-a11y'),
);
const axePath = a11yRequire.resolve('axe-core');
const widths = [320, 375, 393, 430, 768, 1024, 1440];

function observePerformance() {
  const data = (window.__homepageEvidence = {
    lcp: [],
    shifts: [],
    events: [],
    longTasks: [],
    actions: [],
  });
  for (const type of [
    'largest-contentful-paint',
    'layout-shift',
    'event',
    'longtask',
  ]) {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint')
            data.lcp.push({
              start: entry.startTime,
              load: entry.loadTime,
              render: entry.renderTime,
              size: entry.size,
              element: entry.element?.className,
              url: entry.url,
            });
          if (type === 'layout-shift')
            data.shifts.push({
              start: entry.startTime,
              value: entry.value,
              recentInput: entry.hadRecentInput,
              sources: entry.sources?.map(
                ({ node, previousRect, currentRect }) => ({
                  element: node?.id || node?.className || node?.nodeName,
                  previous: {
                    x: previousRect.x,
                    y: previousRect.y,
                    width: previousRect.width,
                    height: previousRect.height,
                  },
                  current: {
                    x: currentRect.x,
                    y: currentRect.y,
                    width: currentRect.width,
                    height: currentRect.height,
                  },
                }),
              ),
            });
          if (type === 'event' && entry.interactionId)
            data.events.push({
              start: entry.startTime,
              duration: entry.duration,
              processingStart: entry.processingStart,
              processingEnd: entry.processingEnd,
              interactionId: entry.interactionId,
              name: entry.name,
            });
          if (type === 'longtask')
            data.longTasks.push({
              start: entry.startTime,
              duration: entry.duration,
            });
        }
      }).observe({
        type,
        buffered: true,
        ...(type === 'event' ? { durationThreshold: 16 } : {}),
      });
    } catch {
      /* Unsupported entry types remain absent, never fabricated. */
    }
  }
}

function cls(shifts) {
  let max = 0,
    sum = 0,
    start = 0,
    last = 0;
  for (const entry of shifts.filter((s) => !s.recentInput)) {
    if (sum === 0 || entry.start - last > 1000 || entry.start - start > 5000) {
      sum = 0;
      start = entry.start;
    }
    sum += entry.value;
    max = Math.max(max, sum);
    last = entry.start;
  }
  return max;
}

module.exports = async function homepageAcceptance({
  browser,
  origin,
  observed,
  artwork,
  setScenario,
}) {
  const evidence = path.join(
    root,
    'tmp/stage34b',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  await fs.mkdir(evidence, { recursive: true });
  const report = {
    browser: browser.version(),
    platform: process.platform,
    environment: {
      node: process.version,
      os: os.release(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      viewportHeight: 900,
      deviceScaleFactor: 1,
      cpuThrottling: 'none',
      network:
        'loopback Nest/Next; intercepted licensed fixture artwork; no network throttling',
      providerDelayMs: 150,
    },
    widths,
    visual: [],
    states: [],
    accessibility: [],
    performance: [],
    failures: [],
  };
  const check = async (name, work) => {
    try {
      await work();
    } catch (error) {
      report.failures.push({ name, message: error.message });
    } finally {
      await fs.writeFile(
        path.join(evidence, 'report.json'),
        JSON.stringify(report, null, 2),
      );
    }
  };
  async function open(width, scenario = {}, motion = 'reduce') {
    setScenario(scenario);
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: motion,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.addInitScript(observePerformance);
    await page.route('https://image.tmdb.org/**', async (route) => {
      const id = Number(
        route
          .request()
          .url()
          .match(/synthetic(\d+)/)?.[1] ?? 42,
      );
      if (scenario.failedArtwork) return route.abort();
      await route.fulfill({
        contentType: 'image/webp',
        body: artwork[(id - 42) % artwork.length],
      });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin, {
      waitUntil: scenario.delay >= 700 ? 'commit' : 'domcontentloaded',
    });
    return { page, context, errors };
  }
  async function settled(page) {
    await expect(page.locator('#discover:visible')).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function geometry(page) {
    const data = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return (
          rect && {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
            right: rect.right,
          }
        );
      };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        hero: box('#discover'),
        copy: box('.hero-content:not([inert])'),
        controls: box('.hero-carousel-controls'),
        landscape: box('#trending .movie-image'),
        poster: box('#films .movie-image'),
      };
    });
    assert.equal(data.overflow, false, 'document horizontal overflow');
    if (data.landscape)
      assert.ok(
        Math.abs(data.landscape.width / data.landscape.height - 16 / 9) < 0.03,
        'landscape ratio',
      );
    if (data.poster)
      assert.ok(
        Math.abs(data.poster.width / data.poster.height - 2 / 3) < 0.03,
        'poster ratio',
      );
    if (data.controls) {
      assert.ok(
        data.controls.y >= data.copy.bottom - 1,
        'Hero controls overlap copy',
      );
      assert.ok(
        data.controls.bottom <= data.hero.bottom + 1,
        'Hero controls outside region',
      );
      for (const control of await page
        .locator('.hero-carousel-controls button')
        .all()) {
        const box = await control.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, 'Hero touch target');
      }
    }
    return data;
  }
  async function readyForFullPageCapture(page) {
    // Full-page screenshots alone do not trigger below-fold lazy artwork.
    for (const selector of [
      '#trending',
      '#films',
      '#collections',
      '#acclaimed',
      '#genres',
      'footer',
    ]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.locator(`${selector} img`).evaluateAll((images) =>
            images.every((image) => {
              const rect = image.getBoundingClientRect();
              return (
                rect.right <= 0 ||
                rect.left >= innerWidth ||
                rect.bottom <= 0 ||
                rect.top >= innerHeight ||
                (image.complete && image.naturalWidth > 0)
              );
            }),
          ),
        )
        .toBe(true);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  try {
    for (const width of widths)
      await check(`visual-${width}`, async () => {
        const { page, context, errors } = await open(width);
        try {
          await settled(page);
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
          const hero = page.getByRole('region', {
            name: 'Featured films',
            exact: true,
          });
          await expect(
            hero.getByRole('button', { name: /^Show featured film/ }),
          ).toHaveCount(5);
          const views = [];
          for (let index = 0; index < 5; index++) {
            const dot = hero.getByRole('button', {
              name: new RegExp(`^Show featured film ${index + 1} of`),
            });
            await dot.click();
            await expect(dot).toHaveAttribute('aria-current', 'true');
            views.push(await geometry(page));
            if ([0, 1, 4].includes(index)) {
              await readyForFullPageCapture(page);
              await page.screenshot({
                path: path.join(evidence, `${width}-hero-${index + 1}.png`),
                fullPage: true,
              });
            }
          }
          await page.locator('.genre-results').evaluate((element) => {
            element.scrollLeft = 500;
          });
          await page
            .getByRole('button', { name: 'Drama', exact: true })
            .click();
          await expect(
            page.getByRole('button', { name: 'Drama', exact: true }),
          ).toHaveAttribute('aria-pressed', 'true');
          assert.equal(
            await page
              .locator('.genre-results')
              .evaluate((element) => element.scrollLeft),
            0,
          );
          await geometry(page);
          await page
            .getByRole('button', { name: 'Show all films', exact: true })
            .click();
          await page.getByText('View selected films', { exact: false }).click();
          await page.getByText('View selected films', { exact: false }).click();
          await page.keyboard.press('Control+Home');
          await page.keyboard.press('Tab');
          // Native skip link is checked directly, without depending on previous click focus.
          const skip = page.getByRole('link', { name: /Skip to/ });
          await skip.focus();
          await page.keyboard.press('Enter');
          await page.keyboard.press('Tab');
          assert.equal(
            await page.evaluate(() =>
              document.querySelector('main').contains(document.activeElement),
            ),
            true,
            'Skip navigation must resume keyboard traversal inside main content',
          );
          if (width < 768) {
            const menu = page.getByRole('button', { name: 'Open navigation' });
            await menu.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 899);
            const normalBox = await menu.boundingBox();
            const menuStyle = () =>
              menu.evaluate((element) => {
                const style = getComputedStyle(element);
                const rgb = (value) => value.match(/[\d.]+/g).map(Number);
                const foreground = rgb(style.color),
                  background = rgb(style.backgroundColor);
                const alpha = background[3] ?? 1;
                const composite = (backdrop) =>
                  background
                    .slice(0, 3)
                    .map((n) => n * alpha + backdrop * (1 - alpha));
                const luminance = (color) =>
                  color
                    .map((n) => {
                      n /= 255;
                      return n <= 0.04045
                        ? n / 12.92
                        : ((n + 0.055) / 1.055) ** 2.4;
                    })
                    .reduce(
                      (sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i],
                      0,
                    );
                return {
                  background: style.backgroundColor,
                  composites: [composite(0), composite(255)],
                  contrasts: [0, 255].map(
                    (backdrop) =>
                      (luminance(foreground) + 0.05) /
                      (luminance(composite(backdrop)) + 0.05),
                  ),
                };
              });
            const normal = await menuStyle();
            await menu.hover();
            await expect
              .poll(async () => (await menuStyle()).background)
              .not.toBe(normal.background);
            const hover = await menuStyle();
            for (const state of [normal, hover])
              assert.ok(
                state.contrasts.every((ratio) => ratio >= 3),
                `Mobile menu contrast over black/white: ${JSON.stringify(state)}`,
              );
            for (let backdrop = 0; backdrop < 2; backdrop++)
              assert.ok(
                Math.max(
                  ...normal.composites[backdrop].map((channel, i) =>
                    Math.abs(channel - hover.composites[backdrop][i]),
                  ),
                ) >= 10,
                'Menu hover must visibly change its backing over black and white',
              );
            assert.deepEqual(
              await menu.boundingBox(),
              normalBox,
              'Menu hover must preserve geometry',
            );
            await page.mouse.move(0, 899);
            await menu.focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('Shift+Tab');
            await expect(menu).toBeFocused();
            assert.equal(
              await menu.evaluate((element) => {
                const style = getComputedStyle(element);
                return (
                  element.matches(':focus-visible') &&
                  style.outlineStyle !== 'none' &&
                  parseFloat(style.outlineWidth) >= 2
                );
              }),
              true,
              'Menu keyboard focus indicator must remain visible',
            );
            await page.getByRole('button', { name: 'Open navigation' }).click();
            await expect(page.getByRole('dialog')).toBeVisible();
            // Radix hides the outside trigger from the accessibility tree while modal.
            await expect(
              page.locator('.site-header button[aria-haspopup="dialog"]'),
            ).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Escape');
            await expect(
              page.getByRole('button', { name: 'Open navigation' }),
            ).toBeFocused();
            await expect(menu).toHaveAttribute('aria-expanded', 'false');
          }
          await expect(page.getByLabel('TMDB credits')).toBeVisible();
          await page.addScriptTag({ path: axePath });
          const axe = await page.evaluate(async () => {
            const result = await window.axe.run(document, {
              runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
              },
            });
            return {
              violations: result.violations.map(({ id, impact, nodes }) => ({
                id,
                impact,
                targets: nodes.map((n) => n.target),
              })),
              incomplete: result.incomplete.map(({ id, nodes }) => ({
                id,
                nodes: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              })),
            };
          });
          report.accessibility.push({ width, ...axe });
          assert.deepEqual(
            axe.violations,
            [],
            'automated WCAG A/AA violations',
          );
          assert.equal(
            axe.incomplete.some(({ id }) => id === 'aria-prohibited-attr'),
            false,
            'Named rail and credit containers must have valid grouping roles',
          );
          assert.deepEqual(errors, []);
          report.visual.push({ width, status: 'PASS', views });
        } finally {
          await context.close();
        }
      });

    const scenarios = [
      ['loading', { delay: 700 }],
      ['empty', { empty: true }],
      ['trending-failure', { failure: 'trending' }],
      ['popular-failure', { failure: 'popular' }],
      ['genres-failure', { failure: 'genres' }],
      ['total-outage', { failure: 'all' }],
      ['missing-backdrop', { missingBackdrop: true }],
      ['missing-metadata', { missingMetadata: true }],
      ['failed-artwork', { failedArtwork: true }],
      ['one-film', { count: 1 }],
      ['two-films', { count: 2 }],
      ['three-films', { count: 3 }],
      ['empty-dictionary', { emptyGenres: true }],
    ];
    for (const width of [320, 768, 1440])
      for (const [name, scenario] of scenarios)
        await check(`${name}-${width}`, async () => {
          const { page, context } = await open(width, scenario);
          try {
            if (name === 'loading') {
              await expect(
                page.locator('[aria-busy="true"]').first(),
              ).toBeVisible();
              await page.screenshot({
                path: path.join(evidence, `${width}-loading.png`),
                fullPage: true,
              });
            }
            await settled(page);
            await geometry(page);
            await expect(page.getByRole('heading', { level: 1 })).toHaveCount(
              1,
            );
            if (name === 'empty' || name === 'missing-backdrop')
              await expect(page.locator('#discover:visible')).toContainText(
                'No featured film',
              );
            if (['trending-failure', 'total-outage'].includes(name))
              await expect(page.locator('#discover:visible')).toContainText(
                'unavailable',
              );
            if (name === 'popular-failure')
              await expect(page.locator('#films:visible')).toContainText(
                'temporarily unavailable',
              );
            if (name === 'genres-failure')
              await expect(page.locator('#genres:visible')).toContainText(
                'temporarily unavailable',
              );
            if (name === 'one-film')
              await expect(
                page.locator('#discover:visible button'),
              ).toHaveCount(0);
            if (name === 'missing-metadata') {
              await expect(
                page.locator('.hero-content:not([inert]) .hero-metadata'),
              ).toHaveText('');
              await expect(
                page.locator('.hero-content:not([inert]) .hero-overview'),
              ).toHaveCount(0);
            }
            if (['two-films', 'three-films'].includes(name))
              await expect(
                page
                  .getByRole('region', { name: 'Featured films', exact: true })
                  .getByRole('button', { name: /^Show featured film/ }),
              ).toHaveCount(scenario.count);
            if (name === 'failed-artwork')
              await expect(
                page.locator('#discover [data-image-unavailable]').first(),
              ).toBeVisible();
            if (['one-film', 'two-films', 'three-films'].includes(name)) {
              await expect(page.locator('#trending .rail-slide')).toHaveCount(
                scenario.count,
              );
              await expect(page.locator('#films .rail-slide')).toHaveCount(
                scenario.count,
              );
            }
            const data = await page.evaluate(() => window.__homepageEvidence);
            report.states.push({
              width,
              name,
              status: 'PASS',
              cls: cls(data.shifts),
              shifts: data.shifts,
            });
            if (['empty', 'total-outage', 'failed-artwork'].includes(name))
              await page.screenshot({
                path: path.join(evidence, `${width}-${name}.png`),
                fullPage: true,
              });
          } finally {
            await context.close();
          }
        });

    // Cold browser contexts; actual browser observers, no fake clock/throttling.
    // Five samples per viewport are local synthetic lab evidence, not field CWV.
    for (const width of process.env.FRAME_HOMEPAGE_ACCEPTANCE_VISUAL_ONLY ===
    'true'
      ? []
      : [393, 1440])
      for (let sample = 0; sample < 5; sample++)
        await check(`performance-${width}-${sample}`, async () => {
          const { page, context } = await open(
            width,
            { delay: 150, count: 14 },
            'no-preference',
          );
          try {
            await settled(page);
            await page.waitForTimeout(2200);
            const initial = await page.evaluate(() => ({
              ...window.__homepageEvidence,
              navigation: performance
                .getEntriesByType('navigation')[0]
                .toJSON(),
              resources: performance
                .getEntriesByType('resource')
                .filter((r) => /synthetic|woff/.test(r.name))
                .map((r) => r.toJSON()),
              fontsReady: document.fonts.status,
            }));
            const baselineMetadata = observed.length;
            await page
              .getByRole('button', { name: 'Pause featured films' })
              .click();
            const action = async (category, work) => {
              const start = await page.evaluate(() => performance.now());
              await work();
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              await page.waitForTimeout(550);
              await page.evaluate(
                ({ category, start }) =>
                  window.__homepageEvidence.actions.push({
                    category,
                    start,
                    end: performance.now(),
                  }),
                { category, start },
              );
            };
            for (let index = 0; index < 6; index++) {
              await action('dot', () =>
                page
                  .getByRole('button', {
                    name: new RegExp(
                      `^Show featured film ${index % 2 ? 1 : 2} of`,
                    ),
                  })
                  .click(),
              );
              await action('play-pause', () =>
                page
                  .getByRole('button', {
                    name: /^(Play|Pause) featured films$/,
                  })
                  .click(),
              );
              await action('genre', () =>
                page
                  .getByRole('button', {
                    name: index % 2 ? 'Comedy' : 'Drama',
                    exact: true,
                  })
                  .click(),
              );
              await action('rail', () =>
                page
                  .getByRole('button', {
                    name:
                      index % 2 ? 'Previous Trending Now' : 'Next Trending Now',
                    exact: true,
                  })
                  .click(),
              );
              await action('disclosure', () =>
                page.getByText('View selected films', { exact: false }).click(),
              );
              if (width < 768) {
                await action('mobile-menu', () =>
                  page.getByRole('button', { name: 'Open navigation' }).click(),
                );
                await action('menu-escape', () =>
                  page.keyboard.press('Escape'),
                );
              }
            }
            await page.waitForTimeout(1000); // Complete observer drain; no censored late entries.
            const final = await page.evaluate(() => window.__homepageEvidence);
            assert.equal(
              observed.length,
              baselineMetadata,
              'interactions must not fetch Catalog metadata',
            );
            report.performance.push({
              width,
              sample,
              initial,
              final,
              initialCLS: cls(initial.shifts),
              finalCLS: cls(final.shifts),
            });
          } finally {
            await context.close();
          }
        });
  } finally {
    await fs.writeFile(
      path.join(evidence, 'report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        homepageAcceptanceEvidence: path.relative(root, evidence),
        visual: report.visual.length,
        states: report.states.length,
        performance: report.performance.length,
        failures: report.failures,
      }),
    );
  }
  assert.deepEqual(
    report.failures,
    [],
    'production Homepage acceptance checks',
  );
};
