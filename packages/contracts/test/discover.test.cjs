const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOpenApi } = require('../scripts/openapi.cjs');
const { discoverQuerySchema } = require('@frame/contracts');
test('Discover strict query defaults, boundaries, optional blanks and invalid tuples', () => {
  assert.deepEqual(discoverQuerySchema.parse({}), {
    sort: 'popular',
    page: '1',
  });
  for (const q of [
    { genreId: '18', yearFrom: '1800', yearTo: '2100', sort: 'rated' },
    { genreId: '', yearFrom: '', yearTo: '', sort: 'newest' },
    { yearFrom: '1990' },
    { yearTo: '1999' },
  ])
    assert.equal(discoverQuerySchema.safeParse(q).success, true);
  for (const q of [
    { genreId: '0' },
    { genreId: '01' },
    { genreId: '2147483648' },
    { genreId: ['18', '28'] },
    { yearFrom: '1799' },
    { yearTo: '2101' },
    { yearFrom: '2e3' },
    { yearFrom: '2000', yearTo: '1999' },
    { yearFrom: ['1990', '1991'] },
    { sort: 'popularity.desc' },
    { sort: ['rated', 'popular'] },
    { page: '501' },
    { page: '' },
    { page: ['1', '1'] },
    { unknown: '' },
  ])
    assert.equal(
      discoverQuerySchema.safeParse(q).success,
      false,
      JSON.stringify(q),
    );
});
test('Discover OpenAPI documents policy and bounded query values', async () => {
  const doc = await checkOpenApi();
  const op = doc.paths['/api/v1/movies/discover'].get;
  assert.match(op.description, /100/);
  assert.match(op.description, /500 pages/);
  assert.deepEqual(
    op.parameters.map((p) => p.name),
    ['genreId', 'yearFrom', 'yearTo', 'sort', 'page'],
  );
  assert.deepEqual(op.parameters.find((p) => p.name === 'sort').schema.enum, [
    'popular',
    'newest',
    'rated',
  ]);
  assert.ok(
    new RegExp(
      op.parameters.find((p) => p.name === 'page').schema.pattern,
    ).test('500'),
  );
});
