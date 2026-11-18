// Targeted real-WebGL regression checks. Requires the local development server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const origin = process.env.FRAME_AMBIENT_DEV_ORIGIN || 'http://127.0.0.1:3000';
const evidence = path.resolve(__dirname, '../../tmp/ambient-webgl-review');
const baseline = process.env.FRAME_AMBIENT_REVIEW_BASELINE === 'true';

function observe() {
  window.__pointerListeners = new Set();
  const add = window.addEventListener.bind(window),
    remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, fn, options) => {
    if (type === 'pointermove' && fn?.name.endsWith('onPointerMove'))
      window.__pointerListeners.add(fn);
    return add(type, fn, options);
  };
  window.removeEventListener = (type, fn, options) => {
    if (type === 'pointermove') window.__pointerListeners.delete(fn);
    return remove(type, fn, options);
  };
  const context = HTMLCanvasElement.prototype.getContext;
  const records = (window.__reviewGPU = []);
  const pending = (window.__reviewRAF = new Map());
  const request = window.requestAnimationFrame.bind(window),
    cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    const id = request((now) => {
      pending.delete(id);
      fn(now);
    });
    pending.set(id, fn.name.split('.').at(-1));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    pending.delete(id);
    cancel(id);
  };
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const gl = context.call(this, kind, ...args);
    if (!gl || !/webgl/.test(kind) || gl.__reviewed) return gl;
    gl.__reviewed = true;
    const record = {
      canvas: this,
      gl,
      kind,
      draws: 0,
      uniforms: {},
      mipmaps: 0,
      injectedStorageErrors: 0,
      allocations: [],
      errors: [],
      framebufferChecks: [],
      resources: {},
      lost: false,
      framebuffers: new Set(),
    };
    records.push(record);
    this.addEventListener('webglcontextlost', () => {
      record.lost = true;
    });
    const locations = new Map();
    const location = gl.getUniformLocation.bind(gl);
    gl.getUniformLocation = (program, name) => {
      const value = location(program, name);
      if (value) locations.set(value, name);
      return value;
    };
    for (const method of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f']) {
      const original = gl[method].bind(gl);
      gl[method] = (location, ...values) => {
        if (locations.has(location))
          record.uniforms[locations.get(location)] = values;
        return original(location, ...values);
      };
    }
    const getError = gl.getError.bind(gl);
    gl.getError = () => {
      const error = getError();
      if (error && error !== gl.CONTEXT_LOST_WEBGL) record.errors.push(error);
      return error;
    };
    const drain = () => {
      while (gl.getError() !== gl.NO_ERROR && !gl.isContextLost()) {}
    };
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
      record.resources[type] = { created: 0, deleted: 0, live: 0 };
      const create = gl['create' + type].bind(gl),
        remove = gl['delete' + type].bind(gl);
      gl['create' + type] = (...values) => {
        if (type === 'Texture' && window.__failTarget === 'texture') {
          record.failureDraws ??= record.draws;
          if (!window.__persistentFailure) window.__failTarget = '';
          return null;
        }
        if (window.__failObject === type) return null;
        const object = create(...values);
        if (object) {
          live.add(object);
          record.resources[type].created++;
          record.resources[type].live = live.size;
          if (type === 'Framebuffer') record.framebuffers.add(object);
        }
        return object;
      };
      gl['delete' + type] = (object) => {
        if (live.delete(object)) record.resources[type].deleted++;
        record.resources[type].live = live.size;
        if (type === 'Framebuffer') record.framebuffers.delete(object);
        return remove(object);
      };
    }
    const extension = gl.getExtension.bind(gl);
    gl.getExtension = (name) => {
      if (name === 'EXT_color_buffer_float' && window.__forceRGBA8) return null;
      const ext = extension(name);
      if (name === 'OES_vertex_array_object' && ext && !ext.__reviewed) {
        ext.__reviewed = true;
        const live = new Set();
        record.resources.VertexArray = { created: 0, deleted: 0, live: 0 };
        const create = ext.createVertexArrayOES.bind(ext),
          remove = ext.deleteVertexArrayOES.bind(ext);
        ext.createVertexArrayOES = () => {
          const object = create();
          if (object) {
            live.add(object);
            record.resources.VertexArray.created++;
            record.resources.VertexArray.live = live.size;
          }
          return object;
        };
        ext.deleteVertexArrayOES = (object) => {
          if (live.delete(object)) record.resources.VertexArray.deleted++;
          record.resources.VertexArray.live = live.size;
          return remove(object);
        };
      }
      return ext;
    };
    if (gl.texStorage2D) {
      const storage = gl.texStorage2D.bind(gl),
        check = gl.checkFramebufferStatus.bind(gl);
      const textures = new Map();
      gl.texStorage2D = (target, levels, format, width, height) => {
        const texture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        if (!textures.has(texture)) textures.set(texture, textures.size + 1);
        record.allocations.push({
          texture: textures.get(texture),
          width,
          height,
          format,
        });
        if (window.__failTarget === 'storage') {
          record.failureDraws ??= record.draws;
          record.injectedStorageErrors++;
          if (!window.__persistentFailure) window.__failTarget = '';
          return storage(target, levels, 0, width, height);
        }
        return storage(target, levels, format, width, height);
      };
      gl.checkFramebufferStatus = (target) => {
        let status = check(target);
        if (window.__failTarget === 'framebuffer') {
          record.failureDraws ??= record.draws;
          if (!window.__persistentFailure) window.__failTarget = '';
          status = gl.FRAMEBUFFER_UNSUPPORTED;
        }
        record.framebufferChecks.push(status);
        return status;
      };
    }
    const draw = gl.drawArrays.bind(gl);
    gl.drawArrays = (...values) => {
      record.draws++;
      const result = draw(...values);
      drain();
      return result;
    };
    const mipmap = gl.generateMipmap.bind(gl);
    gl.generateMipmap = (...values) => {
      record.mipmaps++;
      const result = mipmap(...values);
      drain();
      return result;
    };
    return gl;
  };
}

async function start() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.FRAME_CHROMIUM_EXECUTABLE ||
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(observe);
  const page = await context.newPage();
  return { browser, context, page };
}
async function snapshot(page) {
  return page.evaluate(() =>
    window.__reviewGPU.map(({ canvas, gl, framebuffers, ...record }) => {
      if (!gl.isContextLost()) {
        let error;
        while (
          (error = gl.getError()) !== gl.NO_ERROR &&
          error !== gl.CONTEXT_LOST_WEBGL
        ) {}
      }
      return {
        ...record,
        connected: canvas.isConnected,
        width: canvas.width,
        height: canvas.height,
      };
    }),
  );
}
async function idle(page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...window.__reviewRAF.values()].filter((name) => name === 'frame')
              .length,
        ),
      { timeout: 10000 },
    )
    .toBe(0);
  await page.waitForTimeout(350);
  const before = (await snapshot(page)).map((r) => r.draws);
  await page.waitForTimeout(350);
  assert.deepEqual(
    (await snapshot(page)).map((r) => r.draws),
    before,
    'no continuous GPU drawing',
  );
  assert.equal(
    await page.evaluate(
      () =>
        [...window.__reviewRAF.values()].filter((name) => name === 'frame')
          .length,
    ),
    0,
    'no pending renderer RAF',
  );
}
async function ready(page) {
  const preview = page.locator('[data-candidate]');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('data-renderer-status', 'ready', {
    timeout: 45000,
  });
  await expect(preview.locator('canvas')).toHaveCount(1);
  return preview;
}
function clean(records) {
  for (const record of records) {
    assert.deepEqual(record.errors, [], `${record.kind}: GL errors`);
    for (const status of record.framebufferChecks)
      assert.equal(status, 0x8cd5, 'FRAMEBUFFER_COMPLETE');
    if (!record.connected)
      assert.ok(
        Object.values(record.resources).every((r) => r.live === 0),
        'unmounted GPU ownership must be zero',
      );
  }
}
async function hashes() {
  const vendor = path.resolve(
    __dirname,
    '../../apps/web/src/components/visual/ambient-vendor',
  );
  const expected = JSON.parse(
    await fs.readFile(path.join(vendor, 'shader-hashes.json'), 'utf8'),
  );
  for (const name of ['DarkVeil', 'Aurora']) {
    const source = await fs.readFile(path.join(vendor, name + '.tsx'), 'utf8');
    const actual = Object.fromEntries(
      [
        ...source.matchAll(
          /const (QUAD_VERTEX|FIELD|COMPOSITE|VERTEX|FRAGMENT) = `([\s\S]*?)`;/g,
        ),
      ].map(([, key, shader]) => [
        key,
        crypto.createHash('sha256').update(shader).digest('hex'),
      ]),
    );
    assert.deepEqual(actual, expected[name]);
  }
}

test(
  'Dark Veil real WebGL2 resize, immutable storage and GPU cleanup',
  { timeout: 240000 },
  async () => {
    const { browser, context, page } = await start();
    const report = { cases: [], pageErrors: [] };
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    try {
      await hashes();
      await page.goto(origin + '/dev/ambient');
      await page
        .getByRole('button', { name: 'Dark Veil', exact: true })
        .click();
      let preview = await ready(page);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await idle(page);
      clean(await snapshot(page));
      for (const width of [393, 768, 320, 1024, 430, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await preview.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await idle(page);
        const records = await snapshot(page);
        report.cases.push({ viewport: width, records });
        clean(records);
        const active = records.findLast((r) => r.connected);
        assert.equal(
          new Set(active.allocations.map((a) => a.texture)).size,
          active.allocations.length,
          'one immutable storage allocation per texture',
        );
        assert.equal(
          active.resources.Texture.live,
          1,
          'only the current target texture remains owned',
        );
        assert.ok(active.mipmaps > 0, 'mipmap generation preserved');
      }
      // Resize the container while the viewport stays fixed.
      for (const width of [700, 1000, 850]) {
        await preview.evaluate((node, width) => {
          node.style.width = width + 'px';
        }, width);
        await idle(page);
        clean(await snapshot(page));
      }
      await preview.evaluate((node) => {
        node.style.width = '';
      });
      for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: 'Expand preview' }).click();
        await ready(page);
        await idle(page);
        clean(await snapshot(page));
        await page.keyboard.press('Escape');
        preview = await ready(page);
        await idle(page);
        clean(await snapshot(page));
      }
      await page.screenshot({
        path: path.join(evidence, 'dark-veil-desktop.png'),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Aurora', exact: true }).click();
      await ready(page);
      await page.waitForTimeout(100);
      clean(await snapshot(page));
      await page
        .getByRole('button', { name: 'Dark Veil', exact: true })
        .click();
      preview = await ready(page);
      await idle(page);
      clean(await snapshot(page));
      await preview
        .locator('canvas')
        .evaluate((canvas) =>
          canvas
            .getContext('webgl2')
            .getExtension('WEBGL_lose_context')
            .loseContext(),
        );
      await expect(preview).toHaveAttribute('data-renderer-status', 'fallback');
      await expect(preview.locator('canvas')).toHaveCount(0);
      await idle(page);
      clean(await snapshot(page));
      await page.getByRole('button', { name: 'Reset defaults' }).click();
      preview = await ready(page);
      // Reduced motion unmounts the renderer while preserving this document's instrumentation.
      await page.getByLabel('Reduced-motion preview', { exact: true }).check();
      await idle(page);
      const final = await snapshot(page);
      clean(final);
      assert.ok(
        final.every((r) =>
          Object.values(r.resources).every((resource) => resource.live === 0),
        ),
      );
      report.cases.push({
        lifecycle:
          'Strict Mode, expanded preview, switching, context loss, unmount PASS',
        records: final,
      });
      // Exercise the existing non-float fallback on a real WebGL2 context.
      await page.addInitScript(() => {
        window.__forceRGBA8 = true;
      });
      await page.reload();
      await page
        .getByRole('button', { name: 'Dark Veil', exact: true })
        .click();
      preview = await ready(page);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.setViewportSize({ width: 375, height: 900 });
      await idle(page);
      clean(await snapshot(page));
      await page.setViewportSize({ width: 1024, height: 1000 });
      await idle(page);
      const rgba8 = await snapshot(page);
      clean(rgba8);
      assert.ok(
        rgba8
          .filter((r) => r.connected)
          .every((r) => r.allocations.every((a) => a.format === 0x8058)),
      );
      report.cases.push({ format: 'RGBA8 fallback PASS', records: rgba8 });
      assert.deepEqual(report.pageErrors, []);
    } finally {
      await fs.mkdir(evidence, { recursive: true });
      await fs.writeFile(
        path.join(evidence, baseline ? 'baseline-resize.json' : 'resize.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);

test(
  'ambient secondary pause, hidden redraw and unmount ownership',
  { timeout: 180000 },
  async () => {
    const { browser, page } = await start();
    const report = [];
    const hiddenFailures = [];
    try {
      for (const candidate of ['custom', 'aurora', 'dark-veil']) {
        await page.goto(origin + '/dev/ambient');
        await page
          .getByRole('button', {
            name:
              candidate === 'custom'
                ? 'Original OGL'
                : candidate === 'aurora'
                  ? 'Aurora'
                  : 'Dark Veil',
            exact: true,
          })
          .click();
        await ready(page);
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await idle(page);
        const frozen = (await snapshot(page)).reduce((n, r) => n + r.draws, 0);
        await page
          .getByRole('slider', { name: 'Intensity / brightness' })
          .fill('1.1');
        await idle(page);
        assert.ok(
          (await snapshot(page)).reduce((n, r) => n + r.draws, 0) > frozen,
          'visible paused settings redraw',
        );
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await idle(page);
        const before = (await snapshot(page)).map((r) => r.draws);
        await page
          .getByRole('slider', { name: 'Intensity / brightness' })
          .fill('1.2');
        await idle(page);
        const after = (await snapshot(page)).map((r) => r.draws);
        report.push({ candidate, hiddenBefore: before, hiddenAfter: after });
        if (JSON.stringify(after) !== JSON.stringify(before))
          hiddenFailures.push(candidate);
        await page.evaluate(() => {
          delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.waitForTimeout(250);
        const resumed = (await snapshot(page)).reduce((n, r) => n + r.draws, 0);
        await page.waitForTimeout(300);
        assert.ok(
          (await snapshot(page)).reduce((n, r) => n + r.draws, 0) > resumed,
        );
        await page
          .getByLabel('Reduced-motion preview', { exact: true })
          .check();
        await idle(page);
        const final = await snapshot(page);
        clean(final);
        assert.ok(
          final.every((r) =>
            Object.values(r.resources).every((resource) => resource.live === 0),
          ),
        );
        report.push({ candidate, unmount: final });
      }
      assert.deepEqual(
        hiddenFailures,
        [],
        'hidden setting changes must not draw',
      );
    } finally {
      await fs.mkdir(evidence, { recursive: true });
      await fs.writeFile(
        path.join(
          evidence,
          baseline ? 'baseline-lifecycle.json' : 'lifecycle.json',
        ),
        JSON.stringify(report, null, 2),
      );
      await browser.close();
    }
  },
);

test(
  'Dark Veil target allocation and framebuffer failure fall back without drawing',
  { skip: baseline, timeout: 180000 },
  async () => {
    const { browser, context } = await start();
    const report = [];
    try {
      for (const phase of ['initial', 'resize'])
        for (const failure of ['texture', 'storage', 'framebuffer']) {
          const page = await context.newPage();
          const pageErrors = [];
          page.on('pageerror', (error) => pageErrors.push(error.message));
          if (phase === 'initial')
            await page.addInitScript((failure) => {
              window.__failTarget = failure;
              window.__persistentFailure = true;
            }, failure);
          await page.goto(origin + '/dev/ambient');
          await page
            .getByRole('button', { name: 'Dark Veil', exact: true })
            .click();
          const preview = page.locator('[data-candidate]');
          await preview.scrollIntoViewIfNeeded();
          let before = 0;
          if (phase === 'resize') {
            await ready(page);
            await page
              .getByRole('button', { name: 'Pause', exact: true })
              .click();
            await idle(page);
            before = (await snapshot(page)).reduce((n, r) => n + r.draws, 0);
            await page.evaluate((failure) => {
              window.__failTarget = failure;
              window.__persistentFailure = true;
            }, failure);
            await preview.evaluate((node) => {
              node.style.width = '780px';
            });
          }
          await expect(preview).toHaveAttribute(
            'data-renderer-status',
            'fallback',
            { timeout: 45000 },
          );
          await expect(preview.locator('canvas')).toHaveCount(0);
          await idle(page);
          const records = await snapshot(page);
          assert.equal(
            records.reduce((n, r) => n + r.draws, 0),
            before,
            'failed target must never be rendered',
          );
          assert.ok(
            records.every((r) =>
              Object.values(r.resources).every(
                (resource) => resource.live === 0,
              ),
            ),
            'failure releases all GPU ownership',
          );
          const errors = records.flatMap((r) => r.errors);
          if (failure === 'storage')
            assert.ok(
              errors.length > 0 && errors.every((error) => error === 0x0500),
              'only the deliberately injected storage error is allowed',
            );
          else assert.deepEqual(errors, []);
          assert.deepEqual(pageErrors, []);
          report.push({ phase, failure, records });
          await page.close();
        }
    } finally {
      await fs.mkdir(evidence, { recursive: true });
      await fs.writeFile(
        path.join(evidence, 'target-failures.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);

test(
  'Light Pillar valid resize, failure fallback, retry and context cleanup',
  { timeout: 240000 },
  async () => {
    const { browser, context } = await start();
    const report = { cases: [], pageErrors: [] };
    try {
      for (const phase of ['initial', 'resize']) {
        for (const failure of ['texture', 'storage', 'framebuffer']) {
          const page = await context.newPage();
          page.on('pageerror', (error) =>
            report.pageErrors.push(error.message),
          );
          await page.goto(origin + '/dev/ambient');
          // No renderer is mounted until selection; keep the fault armed through Strict Mode replay.
          if (phase === 'initial')
            await page.evaluate((failure) => {
              window.__failTarget = failure;
              window.__persistentFailure = true;
            }, failure);
          await page
            .getByRole('button', { name: 'Light Pillar', exact: true })
            .click();
          const preview = page.locator('[data-candidate]');
          await preview.scrollIntoViewIfNeeded();
          if (phase === 'resize') {
            await ready(page);
            for (const width of [393, 768, 430, 1440]) {
              await page.setViewportSize({ width, height: 1000 });
              await preview.scrollIntoViewIfNeeded();
              await page.waitForTimeout(150);
            }
            clean(await snapshot(page));
            await page.evaluate((failure) => {
              window.__failTarget = failure;
              const node = document.querySelector('[data-candidate]');
              node.style.width = '700px';
            }, failure);
          }
          await expect(preview).toHaveAttribute(
            'data-renderer-status',
            'fallback',
            { timeout: 45000 },
          );
          await expect(preview.locator('canvas')).toHaveCount(0);
          await idle(page);
          const records = await snapshot(page);
          const target = records.at(-1);
          assert.equal(
            target.draws,
            target.failureDraws ?? 0,
            'no draw after failed target allocation',
          );
          assert.ok(
            Object.values(target.resources).every((r) => r.live === 0),
            'fallback releases every GPU object',
          );
          assert.deepEqual(
            target.errors,
            Array(target.injectedStorageErrors).fill(0x0500),
            'only deliberately injected error',
          );
          report.cases.push({ phase, failure, records });
          await page.evaluate(() => {
            window.__failTarget = '';
            window.__persistentFailure = false;
          });
          await page
            .getByRole('button', { name: 'Reset defaults', exact: true })
            .click();
          await ready(page);
          const active = (await snapshot(page)).at(-1);
          assert.ok(active.draws > 0 && active.framebufferChecks.length > 0);
          clean([active]);
          await page.evaluate(() =>
            window.__reviewGPU
              .at(-1)
              .gl.getExtension('WEBGL_lose_context')
              .loseContext(),
          );
          await expect(preview).toHaveAttribute(
            'data-renderer-status',
            'fallback',
          );
          await idle(page);
          assert.ok(
            Object.values((await snapshot(page)).at(-1).resources).every(
              (r) => r.live === 0,
            ),
          );
          await page.close();
        }
      }
      for (const object of [
        'Buffer',
        'VertexArray',
        'Framebuffer',
        'Program',
        'Shader',
      ]) {
        const page = await context.newPage();
        page.on('pageerror', (error) => report.pageErrors.push(error.message));
        await page.goto(origin + '/dev/ambient');
        await page.evaluate((object) => {
          window.__failObject = object;
        }, object);
        await page
          .getByRole('button', { name: 'Light Pillar', exact: true })
          .click();
        const preview = page.locator('[data-candidate]');
        await preview.scrollIntoViewIfNeeded();
        await expect(preview).toHaveAttribute(
          'data-renderer-status',
          'fallback',
          { timeout: 45000 },
        );
        await idle(page);
        const target = (await snapshot(page)).at(-1);
        assert.equal(target.draws, 0);
        assert.deepEqual(target.errors, []);
        assert.ok(Object.values(target.resources).every((r) => r.live === 0));
        report.cases.push({ object, target });
        await page.close();
      }
      assert.deepEqual(report.pageErrors, []);
      report.result = 'PASS';
    } finally {
      await fs.mkdir(evidence, { recursive: true });
      await fs.writeFile(
        path.join(evidence, 'light-pillar.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);

test(
  'Dark Veil and Aurora activate pointer after mount without rebuilding GPU resources',
  { timeout: 180000 },
  async () => {
    const { browser, context, page } = await start();
    const report = { cases: [], pageErrors: [] };
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    try {
      await page.goto(origin + '/dev/ambient');
      for (const candidate of ['Dark Veil', 'Aurora']) {
        await page
          .getByRole('button', { name: candidate, exact: true })
          .click();
        const preview = await ready(page);
        const toggle = page.getByRole('checkbox', {
          name: 'Pointer interaction',
          exact: true,
        });
        await expect(toggle).not.toBeChecked();
        assert.equal(
          await page.evaluate(() => window.__pointerListeners.size),
          0,
        );
        const initialCount = (await snapshot(page)).length;
        const initial = (await snapshot(page)).at(-1);
        for (let iteration = 0; iteration < 2; iteration++) {
          await toggle.check();
          assert.equal(
            await page.evaluate(() => window.__pointerListeners.size),
            1,
          );
          const box = await preview.boundingBox();
          await page.mouse.move(
            box.x + box.width * 0.2,
            box.y + box.height * 0.3,
          );
          await page.waitForTimeout(250);
          const first = (await snapshot(page)).at(-1).uniforms.uPointer;
          await page.mouse.move(
            box.x + box.width * 0.8,
            box.y + box.height * 0.7,
          );
          await page.waitForTimeout(500);
          const active = (await snapshot(page)).at(-1);
          assert.notDeepEqual(
            active.uniforms.uPointer.slice(0, 2),
            first.slice(0, 2),
          );
          assert.ok(active.uniforms.uPointer[2] > 0);
          assert.equal(
            (await snapshot(page)).length,
            initialCount,
            'toggle does not recreate context',
          );
          assert.equal(
            active.resources.Program.created,
            initial.resources.Program.created,
          );
          await toggle.uncheck();
          assert.equal(
            await page.evaluate(() => window.__pointerListeners.size),
            0,
          );
          await page.waitForTimeout(150);
          assert.equal(
            (await snapshot(page)).at(-1).uniforms.uPointer[2],
            0,
            'disabled pointer effect clears',
          );
          if (candidate === 'Dark Veil')
            assert.deepEqual(
              (await snapshot(page)).at(-1).uniforms.uDrag,
              [0, 0],
            );
          report.cases.push({
            candidate,
            iteration,
            pointer: active.uniforms.uPointer,
          });
        }
        // Same renderer in expanded preview, including the existing text overlay.
        await page
          .getByRole('button', { name: 'Expand preview', exact: true })
          .click();
        await toggle.check();
        const box = await preview.boundingBox();
        await page.mouse.move(
          box.x + box.width * 0.6,
          box.y + box.height * 0.6,
        );
        await page.waitForTimeout(300);
        assert.ok((await snapshot(page)).at(-1).uniforms.uPointer[2] > 0);
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: 'Grid Motion', exact: true })
          .click();
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => window.__pointerListeners.size),
          0,
        );
        clean(await snapshot(page));
      }
      assert.deepEqual(report.pageErrors, []);
      report.result = 'PASS';
    } finally {
      await fs.writeFile(
        path.join(evidence, 'pointer-activation.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);

test(
  'Original OGL speed zero stops drawing, allows static redraw and resumes without a time jump',
  { timeout: 120000 },
  async () => {
    const { browser, context, page } = await start();
    const report = {};
    try {
      await page.goto(origin + '/dev/ambient');
      await page
        .getByRole('button', { name: 'Original OGL', exact: true })
        .click();
      await ready(page);
      const speed = page.getByRole('slider', {
        name: 'Speed',
        exact: true,
      });
      const first = (await snapshot(page)).at(-1);
      await page.waitForTimeout(500);
      assert.ok((await snapshot(page)).at(-1).draws > first.draws);
      await speed.fill('0');
      await idle(page);
      const stopped = (await snapshot(page)).at(-1);
      const intensity = page.getByRole('slider', {
        name: 'Intensity / brightness',
        exact: true,
      });
      await intensity.fill('0.9');
      await page.waitForTimeout(150);
      const redraw = (await snapshot(page)).at(-1);
      assert.ok(
        redraw.draws > stopped.draws && redraw.draws - stopped.draws <= 3,
      );
      assert.deepEqual(redraw.uniforms.uTime, stopped.uniforms.uTime);
      await idle(page);
      await page
        .getByRole('combobox', { name: 'Palette', exact: true })
        .selectOption('blue');
      await page.waitForTimeout(150);
      const palette = (await snapshot(page)).at(-1);
      assert.ok(
        palette.draws > redraw.draws && palette.draws - redraw.draws <= 3,
      );
      assert.deepEqual(palette.uniforms.uTime, stopped.uniforms.uTime);
      await page
        .getByRole('button', { name: 'Expand preview', exact: true })
        .click();
      await idle(page);
      await page.keyboard.press('Escape');
      await idle(page);
      await speed.fill('0.35');
      await page.waitForTimeout(400);
      const resumed = (await snapshot(page)).at(-1);
      assert.ok(resumed.draws > redraw.draws);
      const elapsed = resumed.uniforms.uTime[0] - stopped.uniforms.uTime[0];
      assert.ok(
        elapsed >= 0 && elapsed < 0.3,
        'resume excludes time spent stopped',
      );
      assert.equal(
        resumed.resources.Program.created,
        first.resources.Program.created,
      );
      await page
        .getByRole('button', { name: 'Grid Motion', exact: true })
        .click();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await idle(page);
      clean(await snapshot(page));
      report.result = 'PASS';
      report.stopped = stopped;
      report.redraw = redraw;
      report.resumed = resumed;
    } finally {
      await fs.writeFile(
        path.join(evidence, 'zero-speed.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);
