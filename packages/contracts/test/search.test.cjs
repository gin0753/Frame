const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOpenApi } = require('../scripts/openapi.cjs');
const { searchQuerySchema, catalogContracts } = require('@frame/contracts');

test('search trims edges, preserves case/internal whitespace and validates boundaries strictly', () => {
  assert.deepEqual(searchQuerySchema.parse({ q: '  Amélie & A  B + 東京  ' }), {
    q: 'Amélie & A  B + 東京',
    page: '1',
  });
  assert.equal(
    searchQuerySchema.safeParse({ q: 'a'.repeat(200) }).success,
    true,
  );
  for (const input of [
    {},
    { q: '' },
    { q: ' \t ' },
    { q: 'a'.repeat(201) },
    { q: ['a', 'b'] },
    { q: 'a', genreId: '18' },
    ...['501', '01', '', '0', ['1', '1']].map((page) => ({ q: 'a', page })),
  ]) {
    assert.equal(searchQuerySchema.safeParse(input).success, false);
  }
  catalogContracts.search.response.parse({
    items: [],
    page: 1,
    pageSize: 20,
    totalPages: 0,
    totalResults: 0,
  });
});
test('search OpenAPI exposes required bounded query and accessible pagination policy', async () => {
  const doc = await checkOpenApi();
  const route = doc.paths[catalogContracts.search.path].get;
  const q = route.parameters.find((p) => p.name === 'q');
  assert.equal(q.required, true);
  assert.equal(q.schema.minLength, 1);
  assert.equal(q.schema.maxLength, 200);
  assert.ok(
    new RegExp(
      route.parameters.find((p) => p.name === 'page').schema.pattern,
    ).test('500'),
  );
  assert.match(route.description, /Pages 1-500/);
  assert.match(route.description, /500 pages\/10000 results/);
  assert.ok(route.responses[429]);
});
