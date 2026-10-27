const { test } = require('node:test');
const assert = require('node:assert/strict');
const { databaseUrl } = require('../dist/database/database.service');
const { testTarget } = require('../scripts/database.cjs');
const { createApp } = require('../dist/main');

test('database configuration errors are sanitized', () => {
  assert.equal(databaseUrl(undefined), undefined);
  for (const value of [
    '',
    'secret',
    'https://user:secret@example.com/db',
    'postgresql://localhost',
  ]) {
    assert.throws(() => databaseUrl(value), {
      message: 'Invalid database configuration',
    });
  }
});

test('integration target rejects shared, dev and malformed URLs', () => {
  const safe = 'postgresql://frame_test:secret@127.0.0.1:5434/frame_test';
  assert.equal(testTarget(safe, safe).hostname, '127.0.0.1');
  for (const value of [
    safe.replace('127.0.0.1', 'example.com'),
    safe.replace('frame_test', 'frame_dev'),
    `${safe}?schema=public`,
    safe.replace(':5434', ''),
    safe.replace(':secret', ''),
    'invalid',
  ]) {
    assert.throws(
      () => testTarget(value, safe),
      /Unsafe integration database target/,
    );
    assert.throws(
      () => testTarget(value, value),
      /Unsafe integration database target/,
    );
  }
});

test('missing database permits liveness but fails readiness safely', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let app;
  try {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const ready = await fetch(`${origin}/api/v1/ready`);
    assert.equal(ready.status, 503);
    assert.equal(ready.headers.get('cache-control'), 'no-store');
    const text = await ready.text();
    assert.ok(!/Prisma|postgres|DATABASE_URL|password|stack/i.test(text));
    const live = await fetch(`${origin}/api/v1/health`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok', service: 'frame-api' });
  } finally {
    await app?.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
