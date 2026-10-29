const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOpenApi } = require('../scripts/openapi.cjs');
const c = require('@frame/contracts');
const summary = {
  id: 42,
  source: 'tmdb',
  title: 'Synthetic',
  releaseDate: null,
  posterUrl: null,
  backdropUrl: null,
  genreIds: [],
  voteAverage: 0,
  voteCount: 0,
  overview: null,
  externalUrl: 'https://www.themoviedb.org/movie/42',
  attribution: {
    provider: 'tmdb',
    sourceUrl: 'https://www.themoviedb.org/movie/42',
  },
};
test('strict summary and detail contracts require complete nullable fields and preserve zero votes', async () => {
  assert.deepEqual(c.movieSummarySchema.parse(summary), summary);
  for (const patch of [
    { id: 0 },
    { title: ' ' },
    { releaseDate: '2025-02-30' },
    { voteAverage: 11 },
    { voteCount: -1 },
    { raw: true },
    { overview: undefined },
  ])
    assert.equal(
      c.movieSummarySchema.safeParse({ ...summary, ...patch }).success,
      false,
    );
  const detail = {
    ...summary,
    runtimeMinutes: null,
    directors: [],
    cast: [],
    countries: [],
    languages: [],
    budgetUsd: null,
    revenueUsd: null,
    trailerUrl: null,
    externalLinks: [],
  };
  assert.deepEqual(c.movieDetailSchema.parse(detail), detail);
  assert.equal(
    c.movieDetailSchema.safeParse({ ...detail, runtimeMinutes: 0 }).success,
    false,
  );
  assert.equal(
    c.genresResponseSchema.safeParse({ items: [{ id: 18, name: 'Drama' }] })
      .success,
    true,
  );
  assert.equal(c.genresResponseSchema.safeParse({ genres: [] }).success, false);
  const esm = await import('@frame/contracts');
  assert.deepEqual(esm.movieSummarySchema.parse(summary), summary);
});
test('catalog HTTP schemas constrain trending to page one and popular to 500', () => {
  assert.deepEqual(c.trendingQuerySchema.parse({}), {
    timeWindow: 'week',
    page: '1',
  });
  for (const timeWindow of ['day', 'week'])
    assert.equal(
      c.trendingQuerySchema.parse({ timeWindow, page: '1' }).timeWindow,
      timeWindow,
    );
  for (const page of ['2', '0', '-1', '1.0', '', '01', 'NaN', ['1'], 1])
    assert.equal(c.trendingQuerySchema.safeParse({ page }).success, false);
  assert.equal(
    c.trendingQuerySchema.safeParse({ language: 'en' }).success,
    false,
  );
  assert.equal(c.popularQuerySchema.parse({ page: '500' }).page, '500');
  for (const page of ['501', '1e2', '0', ' 1', ['1', '2']])
    assert.equal(c.popularQuerySchema.safeParse({ page }).success, false);
  for (const tmdbMovieId of ['0', '2147483648', '1.2'])
    assert.equal(c.movieParamsSchema.safeParse({ tmdbMovieId }).success, false);
  assert.equal(
    c.moviePageSchema.safeParse({
      items: [],
      page: 1,
      pageSize: 20,
      totalPages: 0,
      totalResults: 0,
    }).success,
    true,
  );
});
test('catalog OpenAPI is generated from route contracts and states provisional pagination', async () => {
  const doc = await checkOpenApi();
  for (const contract of Object.values(c.catalogContracts)) {
    const operation = doc.paths[contract.path][contract.method];
    assert.equal(operation.operationId, contract.operationId);
    assert.ok(operation.responses['400']);
    assert.ok(operation.responses['503']);
  }
  const operation = doc.paths[c.catalogContracts.trending.path].get;
  const page = operation.parameters.find(
    (parameter) => parameter.name === 'page',
  );
  assert.deepEqual(page.schema.enum, ['1']);
  assert.equal(page.schema.default, '1');
  assert.match(operation.description, /UNVERIFIED/);
  assert.equal(
    operation.parameters.find((parameter) => parameter.name === 'timeWindow')
      .schema.default,
    'week',
  );
});

test('movie-ID runtime and generated OpenAPI validators agree at decimal int32 boundaries', async () => {
  const { z } = require('zod');
  const doc = await checkOpenApi();
  const parameter = doc.paths[
    c.catalogContracts.detail.path
  ].get.parameters.find((parameter) => parameter.name === 'tmdbMovieId');
  assert.equal(parameter.schema.type, 'string');
  assert.ok(parameter.schema.pattern);
  // Reconstruct a validator solely from generated JSON Schema, not the source Zod schema.
  const documented = z.fromJSONSchema(parameter.schema);
  const cases = [
    ['1', true],
    ['2147483647', true],
    ['0', false],
    ['-1', false],
    ['1.5', false],
    ['abc', false],
    ['2147483648', false],
    ['999999999999999999999999999', false],
    ['01', false],
    ['0001', false],
    ['', false],
    [' 1', false],
    ['1e2', false],
    ['1\n', false],
    [1, false],
  ];
  // Exercise every decimal partition and its adjacent boundary, with a numeric oracle.
  for (const value of [
    '9',
    '10',
    '999999999',
    '1000000000',
    '1999999999',
    '2000000000',
    '2099999999',
    '2100000000',
    '2139999999',
    '2140000000',
    '2146999999',
    '2147000000',
    '2147399999',
    '2147400000',
    '2147479999',
    '2147480000',
    '2147482999',
    '2147483000',
    '2147483599',
    '2147483600',
    '2147483639',
    '2147483640',
  ])
    cases.push([value, true]);
  for (const [value, expected] of cases) {
    assert.equal(
      c.movieParamsSchema.safeParse({ tmdbMovieId: value }).success,
      expected,
      `runtime ${JSON.stringify(value)}`,
    );
    assert.equal(
      documented.safeParse(value).success,
      expected,
      `OpenAPI ${JSON.stringify(value)}`,
    );
  }
  for (let value = 2147483600n; value <= 2147483700n; value++) {
    const expected = value <= 2147483647n;
    assert.equal(
      c.movieParamsSchema.safeParse({ tmdbMovieId: String(value) }).success,
      expected,
    );
    assert.equal(documented.safeParse(String(value)).success, expected);
  }
});

test('public pagination rejects contradictions without inventing fullness or accessible-page assumptions', async () => {
  const base = {
    items: [],
    page: 1,
    pageSize: 20,
    totalPages: 0,
    totalResults: 0,
  };
  for (const value of [
    base,
    { ...base, items: [summary], totalPages: 1, totalResults: 1 },
    { ...base, items: [summary], totalPages: 4, totalResults: 61 },
    { ...base, page: 4, items: [summary], totalPages: 4, totalResults: 61 },
    { ...base, page: 5, totalPages: 4, totalResults: 61 },
    { ...base, page: 2, totalPages: 4, totalResults: 61 },
    // Trending page one retains valid provider totals even though only page one is requestable.
    { ...base, items: [summary], totalPages: 600, totalResults: 12000 },
  ])
    assert.deepEqual(c.moviePageSchema.parse(value), value);
  for (const patch of [
    { totalResults: 1 },
    { totalPages: 1 },
    { items: [summary] },
    { page: 0 },
    { page: 501 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 21 },
    { totalPages: -1 },
    { totalPages: 0.5 },
    { totalResults: -1 },
    { totalResults: 0.5 },
    { totalResults: Number.MAX_SAFE_INTEGER + 1 },
    { items: [summary, summary], totalPages: 1, totalResults: 1 },
  ])
    assert.equal(
      c.moviePageSchema.safeParse({ ...base, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  const doc = await checkOpenApi();
  const page =
    doc.paths[c.catalogContracts.trending.path].get.responses[200].content[
      'application/json'
    ].schema;
  assert.match(page.description, /cross-field rules are not encoded/);
  assert.equal(c.trendingQuerySchema.safeParse({ page: '2' }).success, false);
});
