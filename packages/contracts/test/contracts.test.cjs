const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  healthResponseSchema,
  readinessResponseSchema,
  apiErrorSchema,
} = require('@frame/contracts');

const health = { status: 'ok', service: 'frame-api' };
const error = {
  error: {
    code: 'HTTP_ERROR',
    message: 'Service Unavailable',
    requestId: 'req_12345678-1234-4123-8123-123456789abc',
  },
};
for (const [name, schema, valid] of [
  ['health', healthResponseSchema, health],
  ['readiness', readinessResponseSchema, { ...health, status: 'ready' }],
  ['error', apiErrorSchema, error],
]) {
  test(`${name}: valid payload and strict unknown-field policy`, () => {
    assert.deepEqual(schema.parse(valid), valid);
    assert.equal(
      schema.safeParse({ ...valid, internal: 'secret' }).success,
      false,
    );
    for (const invalid of [null, [], {}, 'secret', 1])
      assert.equal(schema.safeParse(invalid).success, false);
    for (const field of Object.keys(valid)) {
      const missing = { ...valid };
      delete missing[field];
      assert.equal(schema.safeParse(missing).success, false);
      assert.equal(schema.safeParse({ ...valid, [field]: 42 }).success, false);
    }
  });
}
test('literal values, error codes, UUID and nested error fields', () => {
  for (const invalid of [
    { ...health, status: 'ready' },
    { ...health, service: 'other' },
    { ...health, status: null },
  ])
    assert.equal(healthResponseSchema.safeParse(invalid).success, false);
  assert.equal(readinessResponseSchema.safeParse(health).success, false);
  for (const code of [
    'VALIDATION_ERROR',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'HTTP_ERROR',
  ])
    assert.equal(
      apiErrorSchema.safeParse({ error: { ...error.error, code } }).success,
      true,
    );
  for (const patch of [
    { code: 'UNKNOWN' },
    { code: 400 },
    { message: '' },
    { message: null },
    { requestId: 'req_example' },
    { requestId: 'client-controlled' },
    { details: ['private'] },
    { stack: 'private' },
  ])
    assert.equal(
      apiErrorSchema.safeParse({ error: { ...error.error, ...patch } }).success,
      false,
    );
  for (const key of Object.keys(error.error)) {
    const incomplete = { ...error.error };
    delete incomplete[key];
    assert.equal(
      apiErrorSchema.safeParse({ error: incomplete }).success,
      false,
    );
  }
});
test('compiled package can be imported through native ESM and CommonJS', async () => {
  const imported = await import('@frame/contracts');
  assert.deepEqual(imported.healthResponseSchema.parse(health), health);
  assert.throws(() => require('@frame/contracts/src/index'));
});
