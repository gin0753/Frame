import { expect, it } from 'vitest';
import { formatRuntime, moviesByGenre } from './presentation';
import { movieFixtures } from './data/fixtures';
it('formats runtimes without presenting unknown values as zero', () => {
  expect(formatRuntime(null)).toBeNull();
  expect(formatRuntime(0)).toBeNull();
  expect(formatRuntime(Number.NaN)).toBeNull();
  expect(formatRuntime(263)).toBe('4m 23s');
  expect(formatRuntime(7260)).toBe('2h 1m');
});
it('selects a genre without modifying the fixture order or input', () => {
  const order = movieFixtures.map((movie) => movie.id);
  expect(
    moviesByGenre(movieFixtures, 'Comedy').map((movie) => movie.id),
  ).toEqual(['cosmos-laundromat', 'sprite-fright']);
  expect(moviesByGenre(movieFixtures, 'Documentary')).toEqual([]);
  expect(movieFixtures.map((movie) => movie.id)).toEqual(order);
});
