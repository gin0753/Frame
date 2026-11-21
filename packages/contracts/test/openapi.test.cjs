const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOpenApi, generateOpenApi } = require('../scripts/openapi.cjs');

test('OpenAPI validates, is deterministic and identifies planned auth routes', async () => {
  const document = await checkOpenApi();
  assert.deepEqual(document, generateOpenApi());
  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(Object.keys(document.paths), [
    '/api/v1/health',
    '/api/v1/ready',
    '/api/v1/movies/discover',
    '/api/v1/movies/search',
    '/api/v1/movies/trending',
    '/api/v1/movies/popular',
    '/api/v1/genres',
    '/api/v1/movies/{tmdbMovieId}',
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/me',
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
  for (const [path, method, success, errors] of [
    ['/api/v1/auth/register', 'post', 201, [400, 403, 409, 429, 503]],
    ['/api/v1/auth/login', 'post', 200, [400, 401, 403, 429, 503]],
    ['/api/v1/auth/logout', 'post', 204, [400, 403, 503]],
    ['/api/v1/me', 'get', 200, [401, 503]],
  ]) {
    const operation = document.paths[path][method];
    assert.match(operation.description, /PLANNED/);
    for (const status of [success, ...errors])
      assert.equal(
        operation.responses[status].headers['Cache-Control'].schema.const,
        'private, no-store',
      );
    if (success === 204)
      assert.equal(operation.responses[success].content, undefined);
    if (method === 'post') assert.ok(operation.requestBody.required);
  }
  assert.deepEqual(document.paths['/api/v1/me'].get.security, [
    { SessionCookie: [] },
  ]);
  assert.equal(document.components.securitySchemes.SessionCookie.in, 'cookie');
  assert.equal(document.servers, undefined); // No local origins or credentials.
  assert.ok(
    !/passwordHash|DATABASE_URL|Prisma|postgresql:\/\//.test(
      JSON.stringify(document),
    ),
  );
});

test('auth OpenAPI exposes string bounds and notes runtime normalization differences', () => {
  const document = generateOpenApi();
  for (const [path, minimum] of [
    ['/api/v1/auth/register', 12],
    ['/api/v1/auth/login', 1],
  ]) {
    const schema =
      document.paths[path].post.requestBody.content['application/json'].schema;
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.email.format, 'email');
    assert.equal(schema.properties.email.maxLength, 254);
    assert.match(schema.properties.email.description, /normalization/);
    assert.equal(schema.properties.password.minLength, minimum);
    assert.equal(schema.properties.password.maxLength, 128);
    assert.match(schema.properties.password.description, /UTF-16.*code points/);
    if (minimum === 12)
      assert.equal(schema.properties.displayName.maxLength, 100);
  }
});
