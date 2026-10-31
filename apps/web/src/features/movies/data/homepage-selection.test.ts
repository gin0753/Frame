import { expect, it } from 'vitest';
import type { MovieSummary } from '@frame/contracts';
import { selectHomepage } from './homepage-selection';

export const summary = (id: number): MovieSummary => ({
  id,
  source: 'tmdb',
  title: `Movie ${id}`,
  releaseDate: null,
  overview: 'Summary',
  genreIds: [18],
  posterUrl: null,
  backdropUrl: `https://image.tmdb.org/t/p/w1280/movie${id}.jpg`,
  voteAverage: null,
  voteCount: 0,
  externalUrl: `https://www.themoviedb.org/movie/${id}`,
  attribution: {
    provider: 'tmdb',
    sourceUrl: `https://www.themoviedb.org/movie/${id}`,
  },
});

it('omits invalid essential metadata and refuses a mismatched Hero destination', () => {
  expect(
    selectHomepage(
      [
        { ...summary(1), title: '' },
        { ...summary(2), id: 0 },
        { ...summary(3), externalUrl: 'https://example.test/movie' },
      ],
      [],
    ).hero,
  ).toBeUndefined();
});

it('preserves first occurrences and source order without mutating DTOs', () => {
  const input = [3, 1, 3, 2, 4, 5].map(summary);
  const before = structuredClone(input);
  const selected = selectHomepage(input, [8, 7, 8].map(summary));
  expect(selected.hero?.id).toBe(3);
  expect(selected.trending.map((m) => m.id)).toEqual([1, 2, 4, 5]);
  expect(selected.popular.map((m) => m.id)).toEqual([8, 7]);
  expect(input).toEqual(before);
});
it.each([
  null,
  '/images/fallbacks/backdrop.svg',
  'https://evil.test/image.jpg',
  'https://image.tmdb.org/t/p/w500/wrong.jpg',
])('rejects non-real or unapproved hero artwork %s', (backdropUrl) => {
  expect(
    selectHomepage([{ ...summary(1), backdropUrl }, summary(2)], []).hero?.id,
  ).toBe(2);
  expect(
    selectHomepage([{ ...summary(1), backdropUrl }], []).hero,
  ).toBeUndefined();
});
it.each([1, 2, 3, 4])('keeps a sparse %i-item rail including hero', (count) => {
  const input = Array.from({ length: count }, (_, i) => summary(i + 1));
  expect(selectHomepage(input, input).trending).toEqual(input);
  expect(selectHomepage(input, input).popular).toEqual(input);
});
it('applies cross-rail exclusions only when four unique movies remain', () => {
  const trending = [1, 2, 3, 4, 5].map(summary);
  expect(
    selectHomepage(trending, [1, 6, 7, 8, 9].map(summary)).popular.map(
      (m) => m.id,
    ),
  ).toEqual([6, 7, 8, 9]);
  expect(
    selectHomepage(trending, [1, 6, 7, 8].map(summary)).popular.map(
      (m) => m.id,
    ),
  ).toEqual([1, 6, 7, 8]);
  expect(selectHomepage([], []).hero).toBeUndefined();
});
