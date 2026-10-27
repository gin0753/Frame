const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOpenApi, generateOpenApi } = require('../scripts/openapi.cjs');

test('OpenAPI validates, is deterministic and contains only implemented routes', async () => {
  const document = await checkOpenApi();
  assert.deepEqual(document, generateOpenApi());
  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(Object.keys(document.paths), [
    '/api/v1/health',
    '/api/v1/ready',
  ]);
  for (const [route, statuses, schema] of [
    ['/api/v1/health', ['200', '500'], 'HealthResponse'],
    ['/api/v1/ready', ['200', '500', '503'], 'ReadinessResponse'],
  ]) {
    assert.deepEqual(Object.keys(document.paths[route]), ['get']);
    const responses = document.paths[route].get.responses;
    assert.deepEqual(Object.keys(responses), statuses);
    assert.equal(
      responses[200].content['application/json'].schema.$ref,
      `#/components/schemas/${schema}`,
    );
    for (const response of Object.values(responses))
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
  }
  const schemas = document.components.schemas;
  for (const name of ['HealthResponse', 'ReadinessResponse']) {
    assert.deepEqual(schemas[name].required, ['status', 'service']);
    assert.equal(schemas[name].additionalProperties, false);
    assert.deepEqual(schemas[name].properties.service.enum, ['frame-api']);
  }
  assert.deepEqual(schemas.HealthResponse.properties.status.enum, ['ok']);
  assert.deepEqual(schemas.ReadinessResponse.properties.status.enum, ['ready']);
  assert.deepEqual(schemas.ApiError.required, ['error']);
  assert.deepEqual(schemas.ApiError.properties.error.required, [
    'code',
    'message',
    'requestId',
  ]);
  assert.equal(schemas.ApiError.properties.error.additionalProperties, false);
  assert.ok(document.components.responses.NotFound);
  assert.equal(document.servers, undefined); // No local origins or credentials.
  assert.ok(
    !/passwordHash|DATABASE_URL|Prisma|postgresql:\/\//.test(
      JSON.stringify(document),
    ),
  );
});
