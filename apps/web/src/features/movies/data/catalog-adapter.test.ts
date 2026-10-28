import { describe, expect, it } from 'vitest';
import { movieDetailSchema, movieSummarySchema } from '@frame/contracts';
import { toMoviePreview } from './catalog-adapter';
const summary = movieSummarySchema.parse({
  id: 42,
  source: 'tmdb',
  title: 'Synthetic',
  releaseDate: null,
  posterUrl: null,
  backdropUrl: null,
  genreIds: [18, 999, 28],
  voteAverage: 0,
  voteCount: 0,
  overview: null,
  externalUrl: 'https://www.themoviedb.org/movie/42',
  attribution: {
    provider: 'tmdb',
    sourceUrl: 'https://www.themoviedb.org/movie/42',
  },
});
const fallbacks = {
  poster: { src: '/test-neutral-poster.svg', width: 500, height: 750 },
  backdrop: { src: '/test-neutral-backdrop.svg', width: 1280, height: 720 },
};
describe('catalog presentation boundary', () => {
  it('preserves identity and known genre order, omits absent metadata and uses supplied fallbacks', () => {
    const before = structuredClone(summary);
    const result = toMoviePreview(
      summary,
      [
        { id: 28, name: 'Action' },
        { id: 18, name: 'Drama' },
      ],
      fallbacks,
    );
    expect(result.tmdbMovieId).toBe(42);
    expect(result.genreIds).toEqual([18, 999, 28]);
    expect(result.movie).toMatchObject({
      id: 'tmdb:42',
      year: null,
      genres: ['Drama', 'Action'],
      synopsis: '',
      runtimeSeconds: null,
      destinationLabel: 'TMDB',
      exploreUrl: summary.externalUrl,
      poster: fallbacks.poster,
      backdrop: fallbacks.backdrop,
    });
    expect(result.movie.recognition).toBeUndefined();
    expect(summary).toEqual(before);
    expect(toMoviePreview(summary, [], fallbacks).movie.genres).toEqual([]);
  });
  it('uses verified dates, supplied artwork and one matching detail without fetching', () => {
    const input = {
      ...summary,
      releaseDate: '2020-02-29',
      posterUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
    };
    const detail = movieDetailSchema.parse({
      ...input,
      runtimeMinutes: 90,
      directors: [],
      cast: [],
      countries: [],
      languages: [],
      budgetUsd: null,
      revenueUsd: null,
      trailerUrl: null,
      externalLinks: [],
    });
    const { movie } = toMoviePreview(input, [], fallbacks, detail);
    expect(movie.year).toBe(2020);
    expect(movie.runtimeSeconds).toBe(5400);
    expect(movie.poster.src).toBe(input.posterUrl);
    expect(() =>
      toMoviePreview(summary, [], fallbacks, { ...detail, id: 43 }),
    ).toThrow(/identity/);
    expect(() =>
      toMoviePreview({ ...summary, releaseDate: '2020-02-30' }, [], fallbacks),
    ).toThrow();
  });
});
