const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMovieSummary } = require('../dist/catalog/catalog.normalizer');
const movie = {
  id: 42,
  title: 'Synthetic',
  vote_count: 0,
  genre_ids: [],
  poster_path: '/poster_42.jpg',
  backdrop_path: '/backdrop-42.webp',
};
const configuration = {
  images: {
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w500'],
    backdrop_sizes: ['w1280'],
  },
};

test('image normalization uses configured HTTPS origin, separate sizes and exact safe paths without credentials', () => {
  const result = normalizeMovieSummary(movie, configuration);
  assert.equal(
    result.posterUrl,
    'https://image.tmdb.org/t/p/w500/poster_42.jpg',
  );
  assert.equal(
    result.backdropUrl,
    'https://image.tmdb.org/t/p/w1280/backdrop-42.webp',
  );
  for (const value of [result.posterUrl, result.backdropUrl]) {
    const url = new URL(value);
    assert.equal(url.username + url.password + url.search + url.hash, '');
  }
  for (const absent of [null, undefined, '']) {
    const result = normalizeMovieSummary(
      { ...movie, poster_path: absent, backdrop_path: absent },
      configuration,
    );
    assert.equal(result.posterUrl, null);
    assert.equal(result.backdropUrl, null);
  }
});

test('malformed image paths and unsafe or unavailable configuration fail closed', () => {
  for (const path of [
    '//evil.test/a.jpg',
    'https://evil.test/a.jpg',
    '/a/../b.jpg',
    '/a.jpg?token=secret',
    '/a.svg',
    '/a.jpg#x',
    '/a%2fb.jpg',
    '/a\\b.jpg',
  ])
    for (const field of ['poster_path', 'backdrop_path'])
      assert.throws(() =>
        normalizeMovieSummary({ ...movie, [field]: path }, configuration),
      );
  for (const images of [
    undefined,
    {},
    { ...configuration.images, secure_base_url: 'http://image.tmdb.org/t/p/' },
    { ...configuration.images, secure_base_url: 'https://evil.test/t/p/' },
    { ...configuration.images, poster_sizes: ['original'] },
    { ...configuration.images, backdrop_sizes: ['w500'] },
  ])
    assert.throws(() => normalizeMovieSummary(movie, { images }));
});
