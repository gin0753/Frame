const { test } = require('node:test');
const assert = require('node:assert/strict');
const { get } = require('node:http');
const { runtimeConfig } = require('../dist/config/runtime-config');
const { HealthService } = require('../dist/health/health.module');
const { safeError } = require('../dist/common/safe-exception.filter');
const { Controller, Get, Module, HttpException } = require('@nestjs/common');
const { createApp } = require('../dist/main');
async function errorBody(res, expectedCode) {
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.match(body.error.requestId, /^req_[0-9a-f-]+$/);
  assert.equal(body.error.requestId, res.headers.get('x-request-id'));
  assert.equal(body.error.code, expectedCode);
  return { statusCode: res.status, message: body.error.message };
}
test('deterministic health', () =>
  assert.deepEqual(new HealthService().getHealth(), {
    status: 'ok',
    service: 'frame-api',
  }));
test('safe configuration defaults', () =>
  assert.deepEqual(runtimeConfig({}), {
    nodeEnv: 'development',
    port: 3001,
    host: '127.0.0.1',
  }));
for (const env of [
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: '1.5' },
  { PORT: ' 3001' },
  { PORT: '' },
  { HOST: 'https://secret' },
  { HOST: '' },
  { NODE_ENV: 'staging' },
]) {
  test(`rejects invalid config ${JSON.stringify(env)}`, () =>
    assert.throws(() => runtimeConfig(env)));
}
test('production defaults to loopback', () =>
  assert.equal(runtimeConfig({ NODE_ENV: 'production' }).host, '127.0.0.1'));
test('sanitized status mapping', () => {
  assert.deepEqual(safeError(new Error('secret')), {
    statusCode: 500,
    message: 'Internal Server Error',
  });
  assert.deepEqual(safeError(new HttpException('secret', 403)), {
    statusCode: 403,
    message: 'Forbidden',
  });
});
test('real HTTP integration and clean close', async () => {
  const injectedSecret = 'SECRET database password';
  class FailureController {
    fail() {
      throw new Error(injectedSecret);
    }
  }
  Controller('test-failure')(FailureController);
  Get()(
    FailureController.prototype,
    'fail',
    Object.getOwnPropertyDescriptor(FailureController.prototype, 'fail'),
  );
  class TestModule {}
  Module({
    imports: [require('../dist/app.module').AppModule],
    controllers: [FailureController],
  })(TestModule);
  const app = await createApp(TestModule);
  let server, origin;
  try {
    const express = app.getHttpAdapter().getInstance();
    const observations = [];
    express.use((req, res, next) => {
      observations.push({
        url: req.url,
        ip: req.ip,
        protocol: req.protocol,
        hostname: req.hostname,
        host: req.headers.host,
        forwardedHost: req.headers['x-forwarded-host'],
        origin: req.headers.origin,
      });
      next();
    });

    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    const port = server.address().port;
    origin = `http://127.0.0.1:${port}`;
    assert.equal(express.get('trust proxy'), false);
    const health = await fetch(origin + '/api/v1/health?probe=a%20b', {
      headers: {
        origin: 'https://evil.example',
        'x-forwarded-for': '203.0.113.1',
        'x-forwarded-host': 'spoof.example',
        'x-forwarded-proto': 'https',
      },
    });
    assert.equal(health.status, 200);
    assert.match(health.headers.get('content-type'), /application\/json/);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.equal(
      health.headers.get('content-security-policy'),
      "default-src 'none'; frame-ancestors 'none'",
    );
    assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
    assert.deepEqual(await health.json(), {
      status: 'ok',
      service: 'frame-api',
    });
    assert.equal(observations[0].ip, '127.0.0.1');
    assert.equal(observations[0].protocol, 'http');
    assert.equal(observations[0].host, `127.0.0.1:${port}`);
    assert.equal(observations[0].hostname, '127.0.0.1');
    assert.equal(observations[0].forwardedHost, 'spoof.example');
    const hostResult = await new Promise((resolve, reject) =>
      get(
        origin + '/api/v1/health',
        {
          agent: false,
          timeout: 1000,
          headers: {
            host: 'untrusted.example:8080',
            'x-forwarded-host': 'spoof.example',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      )
        .on('error', reject)
        .on('timeout', function () {
          this.destroy(new Error('Host probe timed out'));
        }),
    );
    assert.equal(hostResult, 200);
    assert.equal(observations[1].host, 'untrusted.example:8080');
    assert.equal(observations[1].hostname, 'untrusted.example');
    assert.equal(observations[1].forwardedHost, 'spoof.example');
    for (const path of ['/health', '/api/v1/missing']) {
      const res = await fetch(origin + path);
      assert.equal(res.status, 404);
      assert.deepEqual(await errorBody(res, 'NOT_FOUND'), {
        statusCode: 404,
        message: 'Not Found',
      });
    }
    const fail = await fetch(origin + '/api/v1/test-failure');
    assert.equal(fail.status, 500);
    assert.equal((await fail.clone().text()).includes(injectedSecret), false);
    assert.deepEqual(await errorBody(fail, 'INTERNAL_ERROR'), {
      statusCode: 500,
      message: 'Internal Server Error',
    });
    const preflight = await fetch(origin + '/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await app.close();
  }
  assert.equal(server.listening, false);
  await assert.rejects(
    new Promise((resolve, reject) => {
      get(origin + '/api/v1/health', { agent: false, timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
        .on('error', reject)
        .on('timeout', function () {
          this.destroy(new Error('Shutdown probe timed out'));
        });
    }),
    { code: 'ECONNREFUSED' },
  );
});

test('production skeleton rejects multipart uploads and test-only routes', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const form = new FormData();
    form.append('file', new Blob(['review upload probe']), 'probe.txt');
    for (const route of ['/api/v1/health', '/api/v1/upload']) {
      const response = await fetch(origin + route, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 404);
      await errorBody(response, 'NOT_FOUND');
    }
    for (const route of [
      '/api/v1/test-failure',
      '/api/v1/transport-failure',
      '/transport-stage12-probe',
    ]) {
      const response = await fetch(origin + route, {
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 404);
      await errorBody(response, 'NOT_FOUND');
    }
    const response = await fetch(origin + '/api/v1/health', {
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'frame-api',
    });
  } finally {
    await app.close();
  }
});
