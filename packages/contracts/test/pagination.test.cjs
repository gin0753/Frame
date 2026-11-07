const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchQuerySchema, discoverQuerySchema } = require('@frame/contracts');
test('Search and Discover share strict supported page syntax', () => {
  for (const [schema, input] of [
    [searchQuerySchema, { q: 'Alien' }],
    [discoverQuerySchema, { genreId: '18', yearFrom: '1990', sort: 'rated' }],
  ]) {
    assert.equal(schema.parse(input).page, '1');
    for (const page of ['1', '2', '500'])
      assert.equal(schema.parse({ ...input, page }).page, page);
    for (const page of [
      '0',
      '501',
      '01',
      '1.0',
      '1e2',
      '+1',
      '-1',
      '',
      ' ',
      ' 1',
      '1 ',
      ['1', '1'],
      1,
    ])
      assert.equal(schema.safeParse({ ...input, page }).success, false);
    assert.equal(schema.safeParse({ ...input, unknown: 'x' }).success, false);
  }
});
