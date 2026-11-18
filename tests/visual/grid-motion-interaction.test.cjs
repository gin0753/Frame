// Focused live-Next regression. Requires the local development server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const origin = process.env.FRAME_AMBIENT_DEV_ORIGIN || 'http://127.0.0.1:3000';
const evidence = path.resolve(__dirname, '../../tmp/grid-motion-fix');

function observe() {
  const request = requestAnimationFrame.bind(window);
  const cancel = cancelAnimationFrame.bind(window);
  window.motionAudit = {
    pending: new Map(),
    frames: 0,
    listeners: [],
    gpuContexts: 0,
  };
  window.requestAnimationFrame = (fn) => {
    const id = request((now) => {
      window.motionAudit.pending.delete(id);
      if (fn.name.split('.').at(-1) === 'frame') window.motionAudit.frames++;
      fn(now);
    });
    window.motionAudit.pending.set(id, fn.name.split('.').at(-1));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    window.motionAudit.pending.delete(id);
    cancel(id);
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const listeners = new Map();
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    if (
      this === window &&
      type === 'pointermove' &&
      typeof fn === 'function' &&
      /motion\.pointer/.test(fn.toString())
    ) {
      const record = { active: true, calls: 0, last: null };
      window.motionAudit.listeners.push(record);
      const wrapped = (event) => {
        record.calls++;
        record.last = {
          x: event.clientX,
          y: event.clientY,
          trusted: event.isTrusted,
        };
        return fn(event);
      };
      listeners.set(fn, { wrapped, record });
      return add.call(this, type, wrapped, options);
    }
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const entry = listeners.get(fn);
    if (this === window && type === 'pointermove' && entry) {
      entry.record.active = false;
      return remove.call(this, type, entry.wrapped, options);
    }
    return remove.call(this, type, fn, options);
  };
  const get = HTMLCanvasElement.prototype.getContext;
  const contexts = new Set();
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const gl = get.call(this, kind, ...args);
    if (/webgl/.test(kind) && gl && !contexts.has(gl)) {
      contexts.add(gl);
      window.motionAudit.gpuContexts++;
    }
    return gl;
  };
}

test(
  'Grid Motion live Gallery parallax, native speed units, reset and lifecycle',
  { timeout: 240000 },
  async () => {
    await fs.mkdir(evidence, { recursive: true });
    const browser = await chromium.launch({
      executablePath:
        process.env.FRAME_CHROMIUM_EXECUTABLE ||
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'no-preference',
    });
    await context.addInitScript(observe);
    const page = await context.newPage();
    const report = {
      origin,
      liveNext: true,
      samples: [],
      lifecycle: [],
      errors: [],
    };
    page.on('pageerror', (error) => report.errors.push(error.message));
    const preview = page.locator('[data-candidate="Grid Motion"]');
    const drift = page.getByRole('slider', {
      name: 'Row drift speed (px/s)',
      exact: true,
    });
    const parallax = page.getByLabel('Row parallax', { exact: true });
    const ready = async () => {
      await preview.scrollIntoViewIfNeeded();
      await expect(page.locator('.grid-motion__row')).toHaveCount(3);
    };
    const sample = async (label) => {
      const state = await page.evaluate(() => {
        const root = document.querySelector('.grid-motion');
        const rows = [...root.querySelectorAll('.grid-motion__row')];
        const tiles = [...root.querySelectorAll('.grid-motion__tile')];
        return {
          rows: rows.map(
            (row) => new DOMMatrix(getComputedStyle(row).transform).m41,
          ),
          spots: tiles.map((tile, i) => ({
            i,
            spot: Number(tile.style.getPropertyValue('--spot') || 0),
            opacity: Number(getComputedStyle(tile).opacity),
          })),
          plane: getComputedStyle(root.querySelector('.grid-motion__plane'))
            .transform,
          pointer: window.motionAudit.listeners.findLast(
            (listener) => listener.active,
          )?.last,
        };
      });
      report.samples.push({ label, ...state });
      return state;
    };
    const move = async (fraction) => {
      const box = await preview.boundingBox();
      await page.mouse.move(
        box.x + box.width * fraction,
        box.y + box.height / 2,
        { steps: 10 },
      );
      await page.waitForTimeout(1400);
    };
    const stopped = async (label) => {
      await expect(page.locator('.grid-motion')).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              [...window.motionAudit.pending.values()].filter(
                (name) => name === 'frame',
              ).length,
          ),
        )
        .toBe(0);
      const before = await page.evaluate(() => window.motionAudit.frames);
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => ({
        frames: window.motionAudit.frames,
        listeners: window.motionAudit.listeners.filter(
          (listener) => listener.active,
        ).length,
      }));
      assert.equal(state.frames, before, label + ': stopped RAF');
      assert.equal(state.listeners, 0, label + ': removed pointer listeners');
      report.lifecycle.push({ label, ...state });
    };
    try {
      await page.goto(origin + '/dev/ambient', { timeout: 90000 });
      await page
        .getByRole('button', { name: 'Grid Motion', exact: true })
        .click();
      await ready();
      await expect(parallax).toBeChecked();
      await expect(drift).toHaveValue('8');
      await expect(drift).toHaveAttribute('min', '0');
      await expect(drift).toHaveAttribute('max', '30');
      await expect(
        page.getByLabel('Pointer interaction', { exact: true }),
      ).toHaveCount(0);
      await page.waitForTimeout(1100);
      await preview.screenshot({
        path: path.join(evidence, 'grid-motion-default-desktop.png'),
      });

      // Isolate pointer translation from automatic row drift.
      await drift.fill('0');
      await ready();
      await move(0.15);
      const left = await sample('default parallax, drift zero, left');
      await move(0.85);
      const right = await sample('default parallax, drift zero, right');
      assert.ok(
        Math.abs(right.rows[1] - left.rows[1]) > 40,
        'default row parallax is visible',
      );
      assert.equal(right.pointer.trusted, true);
      assert.equal(left.plane, right.plane, 'static tilt preserved');

      await parallax.uncheck();
      await ready();
      await page.waitForTimeout(2600);
      await move(0.15);
      const offLeft = await sample('parallax off, drift zero, left');
      await move(0.85);
      const offRight = await sample('parallax off, drift zero, right');
      assert.ok(
        Math.abs(offRight.rows[1] - offLeft.rows[1]) < 1,
        'no pointer translation when disabled',
      );
      const brightest = (state) =>
        state.spots.reduce((a, b) => (a.spot > b.spot ? a : b));
      assert.notEqual(
        brightest(offLeft).i,
        brightest(offRight).i,
        'native spotlight still follows pointer',
      );
      assert.ok(
        brightest(offRight).opacity > 0.9,
        'spotlight still brightens tiles',
      );
      const stationary = await sample('zero-speed stationary start');
      await page.waitForTimeout(700);
      const stationaryEnd = await sample('zero-speed stationary end');
      assert.ok(
        Math.abs(stationaryEnd.rows[1] - stationary.rows[1]) < 0.1,
        'zero stops automatic drift',
      );

      await drift.fill('8');
      await ready();
      await page.waitForTimeout(250);
      const start = await sample('8px/s drift start');
      await page.waitForTimeout(1100);
      const end = await sample('8px/s drift end');
      assert.ok(
        Math.abs(end.rows[1] - start.rows[1]) > 3,
        '8px/s produces automatic movement',
      );

      await drift.fill('0');
      await parallax.check();
      await ready();
      await preview.locator('.grid-motion').evaluate((root) => {
        root.dataset.auditInstance = 'same';
      });
      await page
        .getByRole('button', { name: 'Expand preview', exact: true })
        .click();
      await move(0.15);
      const expandedLeft = await sample('expanded left');
      await move(0.85);
      const expandedRight = await sample('expanded right');
      assert.ok(
        Math.abs(expandedRight.rows[1] - expandedLeft.rows[1]) > 40,
        'expanded parallax works',
      );
      await expect(preview.locator('.grid-motion')).toHaveAttribute(
        'data-audit-instance',
        'same',
      );
      await preview.screenshot({
        path: path.join(evidence, 'grid-motion-expanded.png'),
      });
      await page.keyboard.press('Escape');
      await expect(preview.locator('.grid-motion')).toHaveAttribute(
        'data-audit-instance',
        'same',
      );

      // Preserve independent primary settings without mounting unrelated renderers.
      await drift.fill('13');
      await page.getByLabel('Reduced-motion preview', { exact: true }).check();
      await stopped('reduced-motion preview');
      await page
        .getByRole('button', { name: 'Original OGL', exact: true })
        .click();
      const intensity = page.getByRole('slider', {
        name: 'Intensity / brightness',
        exact: true,
      });
      await intensity.fill('1.05');
      await expect(
        page.getByRole('slider', { name: 'Speed', exact: true }),
      ).toHaveAttribute('max', '1.5');
      await page
        .getByRole('button', { name: 'Grid Motion', exact: true })
        .click();
      await expect(drift).toHaveValue('13');
      await page
        .getByRole('button', { name: 'Original OGL', exact: true })
        .click();
      await expect(intensity).toHaveValue('1.05');
      await page
        .getByRole('button', { name: 'Grid Motion', exact: true })
        .click();
      await expect(drift).toHaveValue('13');
      await parallax.uncheck();
      await page
        .getByRole('button', { name: 'Reset defaults', exact: true })
        .click();
      await expect(drift).toHaveValue('8');
      await expect(parallax).toBeChecked();
      await ready();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await stopped('system reduced motion');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await ready();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await stopped('pause');
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await ready();
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await stopped('hidden document (synthetic event)');
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await ready();
      await page.setViewportSize({ width: 1440, height: 240 });
      await page.evaluate(() => scrollTo(0, 0));
      await stopped('offscreen');
      await page.setViewportSize({ width: 393, height: 1000 });
      await ready();
      await expect(parallax).toBeChecked();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'mobile controls have no horizontal overflow',
      );
      await preview.screenshot({
        path: path.join(evidence, 'grid-motion-default-mobile.png'),
      });
      assert.equal(
        await page.evaluate(() => window.motionAudit.gpuContexts),
        0,
        'Grid Motion creates no GPU contexts',
      );
      await page
        .getByRole('button', { name: 'Grid Distortion', exact: true })
        .click();
      // Pause via shared reduced-motion policy before checking the new selection's control semantics.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(
        page.getByRole('slider', { name: 'strength', exact: true }),
      ).toHaveValue('0.15');
      assert.equal(
        await page.evaluate(
          () =>
            window.motionAudit.listeners.filter((listener) => listener.active)
              .length,
        ),
        0,
        'Grid Motion listener removed on switch',
      );
      assert.deepEqual(report.errors, []);
      report.result = 'PASS';
    } finally {
      await fs.writeFile(
        path.join(evidence, 'browser-report.json'),
        JSON.stringify(report, null, 2),
      );
      await browser.close();
    }
  },
);
