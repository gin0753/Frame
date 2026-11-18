const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const webRequire = createRequire(
  path.resolve(__dirname, '../../apps/web/package.json'),
);
const lintRequire = createRequire(webRequire.resolve('eslint-config-next'));
const a11yRequire = createRequire(
  lintRequire.resolve('eslint-plugin-jsx-a11y'),
);
const axePath = a11yRequire.resolve('axe-core');
const evidence = path.resolve(__dirname, '../../tmp/ambient-gallery');
const origin = process.env.FRAME_AMBIENT_DEV_ORIGIN || 'http://127.0.0.1:3000';
const candidates = [
  'Original OGL',
  'Dark Veil',
  'Aurora',
  'Ghost Fibers',
  'Silk',
  'Orb',
  'Light Pillar',
  'Side Rays',
  'Soft Aurora',
  'Galaxy',
  'Grid Distortion',
  'Grid Motion',
  'Lightning',
  'Magic Rings',
  'Radar',
];

function observe() {
  const original = HTMLCanvasElement.prototype.getContext;
  window.galleryGPU = [];
  window.galleryRAF = new Map();
  const request = requestAnimationFrame.bind(window),
    cancel = cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    const id = request((now) => {
      window.galleryRAF.delete(id);
      fn(now);
    });

    window.galleryRAF.set(id, fn.name.split('.').at(-1));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    window.galleryRAF.delete(id);
    cancel(id);
  };
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    if (window.galleryNoGL && /webgl/.test(kind)) return null;
    const gl = original.call(this, kind, ...args);
    if (!gl || !/webgl/.test(kind) || gl.galleryObserved) return gl;
    gl.galleryObserved = true;
    const record = {
      gl,
      canvas: this,
      draws: 0,
      errors: [],
      framebufferErrors: [],
      resources: {},
      uploads: 0,
    };
    window.galleryGPU.push(record);
    for (const type of [
      'Texture',
      'Framebuffer',
      'Program',
      'Shader',
      'Buffer',
      'VertexArray',
    ]) {
      if (!gl['create' + type]) continue;
      const live = new Set();
      record.resources[type] = live;
      const create = gl['create' + type].bind(gl),
        remove = gl['delete' + type].bind(gl);
      gl['create' + type] = (...values) => {
        const object = create(...values);
        if (object) live.add(object);
        return object;
      };
      gl['delete' + type] = (object) => {
        live.delete(object);
        return remove(object);
      };
    }
    const getError = gl.getError.bind(gl);
    const drain = () => {
      let e;
      while (!gl.isContextLost() && (e = getError())) record.errors.push(e);
    };
    for (const method of [
      'drawArrays',
      'drawArraysInstanced',
      'texImage2D',
      'texSubImage2D',
      'texStorage2D',
      'generateMipmap',
    ]) {
      if (!gl[method]) continue;
      const fn = gl[method].bind(gl);
      gl[method] = (...values) => {
        const result = fn(...values);
        if (method.startsWith('draw')) record.draws++;
        if (method === 'texSubImage2D') record.uploads++;
        drain();
        return result;
      };
    }
    const check = gl.checkFramebufferStatus.bind(gl);
    gl.checkFramebufferStatus = (target) => {
      const s = check(target);
      if (s !== gl.FRAMEBUFFER_COMPLETE) record.framebufferErrors.push(s);
      return s;
    };
    return gl;
  };
}
async function snapshot(page) {
  return page.evaluate(() =>
    window.galleryGPU.map((r) => ({
      connected: r.canvas.isConnected,
      draws: r.draws,
      errors: r.errors,
      framebufferErrors: r.framebufferErrors,
      uploads: r.uploads,
      lost: r.gl.isContextLost(),
      resources: Object.fromEntries(
        Object.entries(r.resources).map(([key, values]) => [key, values.size]),
      ),
    })),
  );
}
async function launch() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(observe);
  return { browser, context, page: await context.newPage() };
}
test(
  'gallery: real WebGL, actual movie interfaces, lifecycle and responsive previews',
  { timeout: 900000 },
  async () => {
    await fs.mkdir(evidence, { recursive: true });
    const { browser, context, page } = await launch();
    const report = { candidates: [], requests: [], pageErrors: [] };
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/\/(api|v1)\//.test(request.url()))
        report.requests.push(request.url());
    });
    try {
      await page.goto(origin + '/dev/ambient');
      for (const route of ['/dev/ambient/custom', '/dev/ambient/library'])
        for (const slash of ['', '/'])
          assert.equal(
            (await context.request.get(origin + route + slash)).status(),
            404,
            route + slash,
          );
      await page.goto(origin + '/dev/ambient');
      await expect(
        page.getByRole('heading', { name: 'Atmospheric', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: 'Content & Interaction',
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(await page.locator('canvas').count(), 0);
      report.initialVendorChunks = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((r) => /gallery-vendor_\w+_tsx_.*\.js/.test(r.name))
          .map((r) => r.name),
      );
      assert.equal(report.initialVendorChunks.length, 0);
      for (const candidate of candidates) {
        console.log('QA ' + candidate);
        const legacy = ['Original OGL', 'Dark Veil', 'Aurora'].includes(
          candidate,
        );
        await page
          .getByRole('button', { name: candidate, exact: true })
          .click();
        const preview = page.locator('[data-candidate]');
        await preview.scrollIntoViewIfNeeded();
        if (candidate === 'Grid Motion') {
          await expect(
            preview.locator('.grid-motion__row').first(),
          ).toBeVisible({ timeout: 60000 });
          await expect
            .poll(
              () =>
                preview
                  .locator('img')
                  .evaluateAll(
                    (images) =>
                      images.filter((i) => i.complete && i.naturalWidth > 0)
                        .length,
                  ),
              { timeout: 30000 },
            )
            .toBeGreaterThan(3);
          assert.equal(await preview.locator('canvas').count(), 0);
          await page.getByLabel('Poster-format items (off: stills)').uncheck();
          await expect
            .poll(() =>
              preview.locator('.grid-motion img').first().getAttribute('src'),
            )
            .toContain('-backdrop.webp');
        } else {
          await expect(
            legacy
              ? preview.locator('canvas')
              : preview.locator('canvas[data-gallery-ready="true"]'),
          ).toBeVisible({ timeout: 90000 });
          assert.equal(await preview.locator('canvas').count(), 1);
        }
        const slider = page.getByRole('slider').first();
        await expect(preview).toHaveAttribute('data-renderer-status', 'ready', {
          timeout: 30000,
        });
        assert.ok(
          (await snapshot(page))
            .filter((r) => !r.connected)
            .every((r) => Object.values(r.resources).every((n) => n === 0)),
          'switch disposal',
        );
        await slider.focus();
        const beforeValue = await slider.inputValue();
        await slider.press('ArrowRight');
        assert.notEqual(await slider.inputValue(), beforeValue);
        if (candidate === 'Grid Distortion') {
          await page.getByLabel('imageSrc').selectOption('1');
          await page.waitForTimeout(700);
          const box = await preview.boundingBox();
          await page.mouse.move(
            box.x + box.width * 0.2,
            box.y + box.height * 0.5,
          );
          await page.mouse.move(
            box.x + box.width * 0.8,
            box.y + box.height * 0.5,
            { steps: 20 },
          );
          assert.ok(
            (await snapshot(page)).some((r) => r.connected && r.uploads > 0),
          );
        }
        if (candidate === 'Magic Rings') {
          await page.getByLabel('Pointer interaction', { exact: true }).check();
          await page
            .getByRole('button', { name: 'Test centered action' })
            .click();
          await expect(
            page.getByText('Centered action activated 1 times'),
          ).toBeVisible();
        }
        if (candidate === 'Radar') {
          await expect(
            page.getByText('Exploring a sample film collection…'),
          ).toBeVisible();
          await page
            .getByRole('button', { name: 'Show conceptual results' })
            .click();
          await expect(
            page.getByText('Preview ready — 3 sample films.'),
          ).toBeVisible();
        }
        await preview.screenshot({
          path: path.join(
            evidence,
            candidate.replaceAll(' ', '-') + '-desktop.png',
          ),
        });
        const responsive = [];
        for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await preview.scrollIntoViewIfNeeded();
          await page.waitForTimeout(250);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            candidate + ': overflow ' + width,
          );
          if (width === 393)
            await preview.screenshot({
              path: path.join(
                evidence,
                candidate.replaceAll(' ', '-') + '-mobile.png',
              ),
            });
          if (width === 393 || width === 1440) {
            await page.addScriptTag({ path: axePath });
            const violations = await page.evaluate(async () =>
              (
                await window.axe.run(document.querySelector('main'), {
                  runOnly: {
                    type: 'tag',
                    values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
                  },
                })
              ).violations.map((v) => ({
                id: v.id,
                targets: v.nodes.map((n) => n.target),
              })),
            );
            assert.deepEqual(
              violations,
              [],
              candidate + ': accessibility ' + width,
            );
            responsive.push({
              width,
              overflow: false,
              axeViolations: violations,
            });
          } else responsive.push({ width, overflow: false });
        }
        const beforeExpand = await page.evaluate(
          () => window.galleryGPU.length,
        );
        if (candidate !== 'Grid Motion')
          await preview
            .locator('canvas')
            .evaluate((c) => (c.dataset.preserveInstance = 'yes'));
        await page
          .getByRole('button', { name: 'Expand preview', exact: true })
          .click();
        await preview.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Expand preview', exact: true }),
        ).toBeVisible();
        assert.equal(
          await page.evaluate(() => window.galleryGPU.length),
          beforeExpand,
          'expanded keeps renderer',
        );
        if (candidate !== 'Grid Motion')
          await expect(preview.locator('canvas')).toHaveAttribute(
            'data-preserve-instance',
            'yes',
          );
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(preview.locator('canvas')).toHaveCount(legacy ? 1 : 0);
        await page.waitForTimeout(150);
        const paused = await snapshot(page);
        assert.ok(paused.every((r) => !r.connected || legacy));
        assert.ok(
          paused.every(
            (r) =>
              (r.connected && legacy) ||
              Object.values(r.resources).every((n) => n === 0),
          ),
          candidate + ': GPU survived pause',
        );
        const draws = paused.map((r) => r.draws);
        await page.waitForTimeout(200);
        assert.deepEqual(
          (await snapshot(page)).map((r) => r.draws),
          draws,
        );
        const pending = await page.evaluate(() =>
          [...window.galleryRAF.values()].filter((name) =>
            ['frame', 'release', 'free'].includes(name),
          ),
        );
        assert.deepEqual(pending, [], candidate + ': pending RAF');
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page
          .getByLabel('Reduced-motion preview', { exact: true })
          .check();
        await expect(preview.locator('canvas')).toHaveCount(0);
        if (candidate === 'Lightning')
          await preview.screenshot({
            path: path.join(evidence, 'Lightning-reduced-motion.png'),
          });
        await page
          .getByLabel('Reduced-motion preview', { exact: true })
          .uncheck();
        // Live system preference check uses page media emulation.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(preview.locator('canvas')).toHaveCount(0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await preview.scrollIntoViewIfNeeded();
        if (candidate !== 'Grid Motion')
          await expect(
            legacy
              ? preview.locator('canvas')
              : preview.locator('canvas[data-gallery-ready]'),
          ).toBeVisible({ timeout: 30000 });
        const gpu = await snapshot(page);
        assert.deepEqual(
          gpu.flatMap((r) => r.errors),
          [],
          candidate + ': GL errors',
        );
        assert.deepEqual(
          gpu.flatMap((r) => r.framebufferErrors),
          [],
          candidate + ': incomplete framebuffer',
        );
        await page
          .getByRole('button', { name: 'Reset defaults', exact: true })
          .click();
        assert.equal(
          await slider.inputValue(),
          beforeValue,
          'candidate defaults',
        );
        report.candidates.push({
          candidate,
          responsive,
          gpu,
        });
      }
      for (const width of [320, 375, 393, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.locator('[data-candidate]').scrollIntoViewIfNeeded();
      await expect(page.locator('canvas[data-gallery-ready]')).toBeVisible({
        timeout: 30000,
      });
      await page.evaluate(() =>
        window.galleryGPU
          .findLast((r) => r.canvas.isConnected)
          .gl.getExtension('WEBGL_lose_context')
          .loseContext(),
      );
      await expect(
        page.getByText('Graphics context lost. Reset to retry.'),
      ).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Reset defaults' }).click();
      await expect(page.locator('canvas[data-gallery-ready]')).toBeVisible({
        timeout: 30000,
      });
      await page.getByRole('button', { name: 'Orb', exact: true }).click();
      await page.locator('[data-candidate]').scrollIntoViewIfNeeded();
      await expect(page.locator('canvas[data-gallery-ready]')).toBeVisible({
        timeout: 30000,
      });
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.evaluate(() => {
        window.galleryNoGL = true;
      });
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(
        page.getByText('WebGL2 is unavailable. Static preview shown.'),
      ).toBeVisible({ timeout: 10000 });
      assert.deepEqual(report.requests, []);
      assert.deepEqual(report.pageErrors, []);
      await page.evaluate(() => {
        window.galleryNoGL = false;
      });
      await page
        .getByRole('button', { name: 'Reset defaults', exact: true })
        .click();
      await page.getByRole('button', { name: 'Silk', exact: true }).click();
      await page.getByRole('slider').fill('1.7');
      await page.getByRole('button', { name: 'Orb', exact: true }).click();
      await page.getByRole('button', { name: 'Silk', exact: true }).click();
      assert.equal(
        await page.getByRole('slider').inputValue(),
        '1.7',
        'independent primary setting retained',
      );
      await page
        .getByRole('button', { name: 'Reset defaults', exact: true })
        .click();
      assert.equal(
        await page.getByRole('slider').inputValue(),
        '1',
        'reset selected defaults',
      );
    } finally {
      await fs.writeFile(
        path.join(evidence, 'development-report.json'),
        JSON.stringify(report, null, 2),
      );
      await browser.close();
    }
  },
);

test(
  'expanded keyboard focus and comparison preferences stay in the unified preview',
  { timeout: 120000 },
  async () => {
    const { browser, page } = await launch();
    try {
      await page.goto(origin + '/dev/ambient');
      await page
        .getByRole('button', { name: 'Magic Rings', exact: true })
        .click();
      const preview = page.locator('[data-candidate]');
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toHaveAttribute('data-renderer-status', 'ready', {
        timeout: 30000,
      });
      await page.getByLabel('Centered content', { exact: true }).uncheck();
      await page
        .getByRole('button', { name: 'Expand preview', exact: true })
        .click();
      const close = page.getByRole('button', {
        name: 'Close expanded preview',
        exact: true,
      });
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(
        page.getByRole('link', { name: 'Pinned React Bits source' }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Expand preview', exact: true }),
      ).toBeFocused();
      await page
        .getByRole('button', { name: 'Original OGL', exact: true })
        .click();
      await expect(
        page.getByLabel('Centered content', { exact: true }),
      ).not.toBeChecked();
      await page
        .getByRole('slider', { name: 'Speed', exact: true })
        .fill('1.1');
      await page
        .getByRole('slider', { name: 'Stars', exact: true })
        .fill('0.8');
      await page
        .getByRole('combobox', { name: 'Palette', exact: true })
        .selectOption('blue');
      await page.getByLabel('Reduced-motion preview', { exact: true }).check();
      await page
        .getByRole('button', { name: 'Reset defaults', exact: true })
        .click();
      await expect(
        page.getByLabel('Centered content', { exact: true }),
      ).toBeChecked();
      await expect(
        page.getByLabel('Reduced-motion preview', { exact: true }),
      ).not.toBeChecked();
      assert.equal(
        await page
          .getByRole('slider', { name: 'Speed', exact: true })
          .inputValue(),
        '0.35',
      );
      assert.equal(
        await page
          .getByRole('slider', { name: 'Stars', exact: true })
          .inputValue(),
        '0.35',
      );
      assert.equal(
        await page
          .getByRole('combobox', { name: 'Palette', exact: true })
          .inputValue(),
        'indigo',
      );
    } finally {
      await browser.close();
    }
  },
);
