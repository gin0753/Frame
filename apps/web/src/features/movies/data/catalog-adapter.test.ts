import { describe, expect, it } from 'vitest';
import { movieDetailSchema, movieSummarySchema } from '@frame/contracts';
import { toMoviePreview } from './catalog-adapter';
import { movieImageFallbacks } from './image-fallbacks';
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
  it.each([
    {
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
      voteAverage: null,
      genreIds: [],
    },
    {
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      backdropUrl: null,
      releaseDate: '2024-01-01',
      voteAverage: 8.2,
      genreIds: [18],
    },
    {
      posterUrl: null,
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      releaseDate: null,
      voteAverage: 0,
      genreIds: [],
    },
  ])(
    'preserves valid nullable metadata and neutral image geometry: %j',
    (fields) => {
      const input = {
        ...summary,
        ...fields,
        title: 'A long synthetic title '.repeat(10).trim(),
      };
      const before = structuredClone(input);
      const result = toMoviePreview(input, [], movieImageFallbacks);
      expect(result.movie.id).toBe('tmdb:42');
      expect(result.movie.title).toBe(input.title);
      expect(result.movie.poster.src).toBe(
        input.posterUrl ?? movieImageFallbacks.poster.src,
      );
      expect(result.movie.backdrop.src).toBe(
        input.backdropUrl ?? movieImageFallbacks.backdrop.src,
      );
      expect([result.movie.poster.width, result.movie.poster.height]).toEqual([
        500, 750,
      ]);
      expect([
        result.movie.backdrop.width,
        result.movie.backdrop.height,
      ]).toEqual([1280, 720]);
      expect(result.movie.recognition).toBeUndefined();
      expect(result.movie).not.toHaveProperty('voteAverage');
      expect(input).toEqual(before);
    },
  );
  it.each([
    'https://evil.test/x.jpg',
    'https://image.tmdb.org/t/p/w500/../x.jpg',
    'https://image.tmdb.org/t/p/w500/x.jpg?token=secret',
  ])(
    'uses neutral artwork for an unapproved normalized image URL: %s',
    (posterUrl) => {
      expect(
        toMoviePreview({ ...summary, posterUrl }, [], movieImageFallbacks).movie
          .poster,
      ).toEqual(movieImageFallbacks.poster);
    },
  );
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
    expect(
      toMoviePreview(input, [], fallbacks, {
        ...detail,
        overview: 'Detail synopsis',
      }).movie.synopsis,
    ).toBe('Detail synopsis');
    expect(
      toMoviePreview(
        { ...input, overview: 'Summary synopsis' },
        [],
        fallbacks,
        { ...detail, overview: null },
      ).movie.synopsis,
    ).toBe('Summary synopsis');
    expect(() =>
      toMoviePreview(summary, [], fallbacks, { ...detail, id: 43 }),
    ).toThrow(/identity/);
    expect(() =>
      toMoviePreview({ ...summary, releaseDate: '2020-02-30' }, [], fallbacks),
    ).toThrow();
  });
});
