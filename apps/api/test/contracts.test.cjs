const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  Module,
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
} = require('@nestjs/common');
const { z } = require('zod');
const {
  healthContract,
  readinessContract,
  apiErrorSchema,
} = require('@frame/contracts');
const { createApp } = require('../dist/main');
const { ZodValidationPipe } = require('../dist/common/zod-validation.pipe');
const { HealthService } = require('../dist/health/health.module');
const { AppModule } = require('../dist/app.module');

test('real HTTP contracts preserve health, unavailable readiness, errors and production route surface', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let app;
  try {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const health = await fetch(origin + healthContract.path);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(healthContract.response.parse(await health.json()), {
      status: 'ok',
      service: 'frame-api',
    });
    assert.equal(health.headers.get('x-request-id'), null);
    for (const [route, status, code] of [
      [readinessContract.path, 503, 'HTTP_ERROR'],
      ['/api/v1/contract-probe', 404, 'NOT_FOUND'],
      ['/api/v1/contract-probe/123', 404, 'NOT_FOUND'],
      ['/api/v1/docs', 404, 'NOT_FOUND'],
      ['/api/v1/openapi.json', 404, 'NOT_FOUND'],
      ['/docs', 404, 'NOT_FOUND'],
      ['/swagger', 404, 'NOT_FOUND'],
      ['/openapi.json', 404, 'NOT_FOUND'],
    ]) {
      const response = await fetch(origin + route, {
        headers: { 'x-request-id': 'req_client-secret' },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = apiErrorSchema.parse(await response.json());
      assert.equal(body.error.code, code);
      assert.equal(body.error.requestId, response.headers.get('x-request-id'));
      assert.ok(!JSON.stringify(body).includes('req_client-secret'));
    }
    const post = await fetch(origin + '/api/v1/contract-probe', {
      method: 'POST',
    });
    assert.equal(post.status, 404);
    // Inject invalid internal data only into this test instance; response parsing must fail closed.
    app.get(HealthService).getHealth = () => ({
      status: 'private',
      service: 'frame-api',
      secret: 'private',
    });
    const invalid = await fetch(origin + healthContract.path);
    assert.equal(invalid.status, 500);
    assert.equal(
      apiErrorSchema.parse(await invalid.json()).error.code,
      'INTERNAL_ERROR',
    );
  } finally {
    await app?.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test('test-only body/query/parameter pipes reject invalid and unknown fields without leaks', async () => {
  class ProbeController {
    body(value) {
      return value;
    }
    read(params, query) {
      return { params, query };
    }
  }
  Controller('contract-probe')(ProbeController);
  Post()(
    ProbeController.prototype,
    'body',
    Object.getOwnPropertyDescriptor(ProbeController.prototype, 'body'),
  );
  Body(new ZodValidationPipe(z.strictObject({ name: z.string().min(1) })))(
    ProbeController.prototype,
    'body',
    0,
  );
  Get(':id')(
    ProbeController.prototype,
    'read',
    Object.getOwnPropertyDescriptor(ProbeController.prototype, 'read'),
  );
  Param(
    new ZodValidationPipe(
      z.strictObject({ id: z.string().regex(/^[1-9][0-9]*$/) }),
    ),
  )(ProbeController.prototype, 'read', 0);
  Query(
    new ZodValidationPipe(
      z.strictObject({
        page: z
          .string()
          .regex(/^[1-9][0-9]*$/)
          .transform(Number),
      }),
    ),
  )(ProbeController.prototype, 'read', 1);
  class TestModule {}
  Module({ imports: [AppModule], controllers: [ProbeController] })(TestModule);
  let app;
  try {
    app = await createApp(TestModule);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const valid = await fetch(origin + '/api/v1/contract-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'safe' }),
    });
    assert.equal(valid.status, 201);
    assert.deepEqual(await valid.json(), { name: 'safe' });
    const query = await fetch(origin + '/api/v1/contract-probe/123?page=2');
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), {
      params: { id: '123' },
      query: { page: 2 },
    });
    const secret = 'INJECTED_PRIVATE_VALUE';
    const requests = [
      [
        '/api/v1/contract-probe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'safe', password: secret }),
        },
      ],
      [
        '/api/v1/contract-probe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 42 }),
        },
      ],
      [
        '/api/v1/contract-probe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      ],
      [`/api/v1/contract-probe/${secret}?page=1`, {}],
      [`/api/v1/contract-probe/123?page=${secret}`, {}],
      [`/api/v1/contract-probe/123?page=1&password=${secret}`, {}],
    ];
    for (const [route, options] of requests) {
      const response = await fetch(origin + route, options);
      assert.equal(response.status, 400);
      const text = await response.text();
      const body = apiErrorSchema.parse(JSON.parse(text));
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.equal(body.error.message, 'Bad Request');
      assert.equal(body.error.requestId, response.headers.get('x-request-id'));
      assert.ok(!text.includes(secret));
      assert.ok(!/Zod|issues|password|expected|received|stack/.test(text));
    }
  } finally {
    await app?.close();
  }
});
