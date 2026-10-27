const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync, fork } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { Pool } = require('pg');
const {
  healthResponseSchema,
  readinessResponseSchema,
  apiErrorSchema,
} = require('@frame/contracts');
const { get } = require('node:http');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { createApp } = require('../dist/main');
const { DatabaseService } = require('../dist/database/database.service');
const {
  localEnvironment,
  testTarget,
  compose,
} = require('../scripts/database.cjs');

// Fresh HTTP sockets: long Docker operations must not reuse expired keep-alives.
function request(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, { agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('error', reject);
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: { get: (name) => res.headers[name] },
          text: async () => body,
          json: async () => JSON.parse(body),
        }),
      );
    });
    req.setTimeout(4000, () =>
      req.destroy(new Error('HTTP readiness deadline exceeded')),
    );
    req.on('error', reject);
  });
}

async function eventuallyReady(origin) {
  const deadline = Date.now() + 10000;
  let response;
  do {
    response = await request(`${origin}/api/v1/ready`);
    if (response.status === 200) return response;
    assert.equal(response.status, 503);
    await pause(100);
  } while (Date.now() < deadline);
  assert.fail('Database did not become ready within ten seconds');
}

// This suite is explicit, never part of the database-free unit test glob.
test('isolated real PostgreSQL foundation', { timeout: 180000 }, async (t) => {
  localEnvironment();
  const target = testTarget(
    process.env.TEST_DATABASE_URL,
    process.env.TEST_DATABASE_URL,
  );
  const schema = `frame_test_${randomUUID().replaceAll('-', '')}`;
  const application = schema;
  const admin = new Pool({
    connectionString: target.href,
    max: 1,
    connectionTimeoutMillis: 1000,
  });
  const url = new URL(target);
  url.searchParams.set('schema', schema);
  url.searchParams.set('application_name', application);
  const connectionString = url.href;
  const client = () =>
    new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString,
          max: 2,
          connectionTimeoutMillis: 1000,
          query_timeout: 1000,
        },
        { schema },
      ),
      log: [],
    });
  const prisma = (args) => {
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), ...args],
      {
        env: { ...process.env, DATABASE_URL: connectionString },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    // CLI diagnostics may contain configuration: never echo them on failure.
    assert.equal(
      result.status,
      0,
      `Prisma ${args.slice(0, 2).join(' ')} failed (diagnostics withheld)`,
    );
    return result.stdout;
  };
  let app;
  let first;
  let second;
  let stopped = false;
  const previous = process.env.DATABASE_URL;
  try {
    await t.test(
      'target is separate from development and PostgreSQL is reachable',
      async () => {
        assert.notEqual(target.href, process.env.DATABASE_URL);
        assert.equal(
          (await admin.query('SELECT current_database() AS name')).rows[0].name,
          'frame_test',
        );
        assert.match(
          (await admin.query('SHOW server_version')).rows[0].server_version,
          /^17\.11/,
        );
        await admin.query(`CREATE SCHEMA "${schema}"`);
      },
    );
    await t.test(
      'fresh migration, repeat deploy, tracked history and zero model drift',
      async () => {
        prisma(['migrate', 'deploy']);
        prisma(['migrate', 'deploy']);
        prisma(['migrate', 'status']);
        prisma([
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          'prisma/schema.prisma',
          '--exit-code',
        ]);
        const history = await admin.query(
          `SELECT migration_name, finished_at, rolled_back_at FROM "${schema}"._prisma_migrations`,
        );
        assert.equal(history.rowCount, 1);
        assert.ok(history.rows[0].finished_at);
        assert.equal(history.rows[0].rolled_back_at, null);
        const checks = await admin.query(
          'SELECT conname FROM pg_constraint WHERE connamespace = $1::regnamespace AND contype = $2',
          [schema, 'c'],
        );
        assert.equal(checks.rowCount, 4); // SQL checks are not represented by Prisma drift tooling.
      },
    );
    const email = `${schema}@example.invalid`;
    await t.test(
      'configured authentication failure keeps liveness and sanitizes readiness',
      async () => {
        const invalid = new URL(target);
        invalid.password = 'injected-database-secret';
        process.env.DATABASE_URL = invalid.href;
        let unavailable;
        try {
          unavailable = await createApp();
          await unavailable.listen(0, '127.0.0.1');
          const origin = await unavailable.getUrl();
          const response = await request(`${origin}/api/v1/ready`);
          assert.equal(response.status, 503);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          const body = await response.text();
          assert.equal(
            apiErrorSchema.parse(JSON.parse(body)).error.code,
            'HTTP_ERROR',
          );
          assert.ok(!body.includes(invalid.password));
          assert.ok(!body.includes(invalid.href));
          assert.ok(
            !/Prisma|postgres|authentication|password|stack/i.test(body),
          );
          assert.equal((await request(`${origin}/api/v1/health`)).status, 200);
        } finally {
          await unavailable?.close();
        }
      },
    );
    await t.test(
      'real write/read, persistence across clients and database constraints',
      async () => {
        first = client();
        const user = await first.user.create({
          data: {
            email,
            passwordHash: 'test-only-no-auth',
            displayName: 'Integration fixture',
          },
        });
        await first.rating.create({
          data: { userId: user.id, tmdbMovieId: 550, score: 8 },
        });
        await first.libraryEntry.create({
          data: { userId: user.id, tmdbMovieId: 550, isWatched: true },
        });
        await first.$disconnect();
        first = undefined;
        second = client();
        assert.equal((await second.rating.findFirstOrThrow()).score, 8);
        assert.equal(
          (await second.libraryEntry.findFirstOrThrow()).viewedOn,
          null,
        );
        await assert.rejects(
          second.user.create({
            data: { email, passwordHash: 'x', displayName: 'x' },
          }),
        );
        await assert.rejects(
          second.user.create({
            data: {
              email: 'UPPER@example.invalid',
              passwordHash: 'x',
              displayName: 'x',
            },
          }),
        );
        await assert.rejects(
          second.rating.create({
            data: { userId: user.id, tmdbMovieId: 551, score: 11 },
          }),
        );
        await assert.rejects(
          second.rating.create({
            data: { userId: randomUUID(), tmdbMovieId: 550, score: 8 },
          }),
        );
        await assert.rejects(
          second.rating.create({
            data: { userId: user.id, tmdbMovieId: 0, score: 8 },
          }),
        );
        await assert.rejects(
          second.rating.create({
            data: { userId: user.id, tmdbMovieId: 550, score: 8 },
          }),
        );
        await assert.rejects(
          second.libraryEntry.create({
            data: {
              userId: user.id,
              tmdbMovieId: 0,
              inWatchlist: true,
            },
          }),
        );
        await assert.rejects(
          second.libraryEntry.update({
            where: {
              userId_tmdbMovieId: { userId: user.id, tmdbMovieId: 550 },
            },
            data: { isWatched: false, viewedOn: new Date('2020-01-01') },
          }),
        );
        await second.user.delete({ where: { id: user.id } });
        assert.equal(await second.rating.count(), 0);
        assert.equal(await second.libraryEntry.count(), 0);
        await second.$disconnect();
        second = undefined;
      },
    );
    await t.test(
      'Nest singleton, real readiness and exactly-once cleanup ownership',
      async () => {
        process.env.DATABASE_URL = connectionString;
        app = await createApp();
        await app.listen(0, '127.0.0.1');
        assert.equal(app.get(DatabaseService), app.get(DatabaseService));
        const ready = await eventuallyReady(await app.getUrl());
        assert.equal(ready.status, 200);
        assert.equal(ready.headers.get('cache-control'), 'no-store');
        assert.deepEqual(readinessResponseSchema.parse(await ready.json()), {
          status: 'ready',
          service: 'frame-api',
        });
        assert.ok(
          (
            await admin.query(
              'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
              [application],
            )
          ).rows[0].n > 0,
        );
      },
    );
    await t.test(
      'real database outage is bounded, sanitized and never cached as ready',
      async () => {
        // Close fixture client/admin sockets before stopping only the dedicated test server.
        await admin.end();
        compose(['stop', 'database-test']);
        stopped = true;
        const started = Date.now();
        const ready = await request(`${await app.getUrl()}/api/v1/ready`);
        assert.equal(ready.status, 503);
        assert.ok(Date.now() - started < 3000);
        const body = await ready.text();
        assert.equal(
          apiErrorSchema.parse(JSON.parse(body)).error.code,
          'HTTP_ERROR',
        );
        assert.ok(!body.includes(target.password));
        assert.ok(!/postgres|Prisma|password|DATABASE_URL|stack/i.test(body));
        const live = await request(`${await app.getUrl()}/api/v1/health`);
        assert.deepEqual(healthResponseSchema.parse(await live.json()), {
          status: 'ok',
          service: 'frame-api',
        });
        compose(['up', '-d', '--wait', 'database-test']);
        stopped = false;
        const readyAgain = await eventuallyReady(await app.getUrl());
        assert.equal(readyAgain.status, 200);
      },
    );
    await t.test('app.close releases all database connections', async () => {
      const database = app.get(DatabaseService);
      await app.close();
      app = undefined;
      assert.equal(
        database.onApplicationShutdown(),
        database.onApplicationShutdown(),
      );
      assert.equal(await database.isReady(), false);
      const observer = new Pool({
        connectionString: target.href,
        max: 1,
        connectionTimeoutMillis: 1000,
      });
      try {
        assert.equal(
          (
            await observer.query(
              'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
              [application],
            )
          ).rows[0].n,
          0,
        );
      } finally {
        await observer.end();
      }
    });
    await t.test(
      'existing shutdown path releases a real child-process database pool',
      async () => {
        const listener = createServer();
        listener.listen(0, '127.0.0.1');
        await once(listener, 'listening');
        const port = listener.address().port;
        await new Promise((resolve) => listener.close(resolve));
        const child = fork(
          resolve(__dirname, 'database-signal.fixture.cjs'),
          [],
          {
            env: {
              ...process.env,
              DATABASE_URL: connectionString,
              HOST: '127.0.0.1',
              PORT: String(port),
            },
            silent: true,
          },
        );
        let logs = '';
        let closed = 0;
        child.on('message', (message) => {
          if (message?.closed) closed = message.closed;
        });
        child.stdout.on('data', (data) => {
          logs += data;
        });
        child.stderr.on('data', (data) => {
          logs += data;
        });
        const observer = new Pool({
          connectionString: target.href,
          max: 1,
          connectionTimeoutMillis: 1000,
        });
        try {
          await once(child, 'message', { signal: AbortSignal.timeout(10000) });
          assert.equal(
            (await eventuallyReady(`http://127.0.0.1:${port}`)).status,
            200,
          );
          const exited = once(child, 'exit', {
            signal: AbortSignal.timeout(7000),
          });
          if (process.platform === 'win32') child.send('SIGTERM');
          else child.kill('SIGTERM');
          const [code, signal] = await exited;
          assert.equal(
            closed,
            1,
            'Nest must complete database cleanup exactly once before exit',
          );
          assert.ok(
            code === 0 ||
              signal === 'SIGTERM' ||
              (process.platform === 'win32' && code === 1),
          );
          assert.equal(
            (
              await observer.query(
                'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
                [application],
              )
            ).rows[0].n,
            0,
          );
          assert.ok(!logs.includes(target.password));
          assert.ok(!logs.includes(connectionString));
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill('SIGKILL');
            await exited;
          }
          await observer.end();
        }
      },
    );
  } finally {
    await app?.close();
    await first?.$disconnect();
    await second?.$disconnect();
    if (!admin.ended) await admin.end();
    if (stopped) compose(['up', '-d', '--wait', 'database-test']);
    const cleanup = new Pool({
      connectionString: target.href,
      max: 1,
      connectionTimeoutMillis: 1000,
    });
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await cleanup.end();
    }
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
