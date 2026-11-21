const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  registerRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  authResponseSchema,
} = require('@frame/contracts');
const register = {
  email: '  TEST@Example.COM  ',
  password: '  password 123  ',
  displayName: '  Film Fan  ',
};
test('registration normalizes identity but preserves password whitespace', () => {
  assert.deepEqual(registerRequestSchema.parse(register), {
    email: 'test@example.com',
    password: register.password,
    displayName: 'Film Fan',
  });
  for (const value of [
    { ...register, email: 'bad' },
    { ...register, email: `${'a'.repeat(250)}@a.co` },
    { ...register, password: 'a'.repeat(11) },
    { ...register, password: 'a'.repeat(129) },
    { ...register, password: '\ud800'.repeat(12) },
    { ...register, displayName: '  ' },
    { ...register, displayName: 'x'.repeat(101) },
    { ...register, extra: true },
  ])
    assert.equal(registerRequestSchema.safeParse(value).success, false);
  assert.equal(
    registerRequestSchema.safeParse({
      ...register,
      password: 'a'.repeat(12),
      displayName: 'x'.repeat(100),
    }).success,
    true,
  );
  assert.equal(
    registerRequestSchema.safeParse({ ...register, password: '😀'.repeat(64) })
      .success,
    true,
  );
});
test('login accepts short credentials while enforcing safe upper bounds', () => {
  assert.deepEqual(
    loginRequestSchema.parse({ email: ' X@EXAMPLE.COM ', password: ' x ' }),
    { email: 'x@example.com', password: ' x ' },
  );
  for (const password of ['', 'x'.repeat(129), '\ud800'])
    assert.equal(
      loginRequestSchema.safeParse({ email: 'x@example.com', password })
        .success,
      false,
    );
  assert.equal(logoutRequestSchema.safeParse({}).success, true);
  assert.equal(
    logoutRequestSchema.safeParse({ token: 'secret' }).success,
    false,
  );
});
test('public responses reject credential and session fields', () => {
  const user = {
    id: '12345678-1234-4123-8123-123456789abc',
    email: 'x@example.com',
    displayName: 'X',
  };
  assert.deepEqual(authResponseSchema.parse({ user }), { user });
  for (const field of ['passwordHash', 'tokenHash', 'token'])
    assert.equal(
      authResponseSchema.safeParse({ user: { ...user, [field]: 'secret' } })
        .success,
      false,
    );
});

test('runtime counts UTF-16 units, preserves bytes and rejects lone surrogates', () => {
  for (const [password, valid] of [
    ['😀'.repeat(5) + 'a', false],
    ['😀'.repeat(6), true],
    ['😀'.repeat(64), true],
    ['😀'.repeat(64) + 'a', false],
    ['\u0800'.repeat(128), true],
    ['a'.repeat(11) + '\ud800', false],
    ['a'.repeat(11) + '\udc00', false],
  ]) {
    const result = registerRequestSchema.safeParse({ ...register, password });
    assert.equal(result.success, valid);
    if (result.success) {
      assert.equal(result.data.password, password);
      assert.ok(Buffer.byteLength(password, 'utf8') <= 512);
    }
  }
  assert.equal(
    loginRequestSchema.safeParse({ email: 'x@example.com', password: '😀' })
      .success,
    true,
  );
  assert.equal(
    loginRequestSchema.safeParse({
      email: 'x@example.com',
      password: '😀',
      extra: true,
    }).success,
    false,
  );
});
