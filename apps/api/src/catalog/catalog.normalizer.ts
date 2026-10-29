import {
  genreSchema,
  movieSummarySchema,
  movieDetailSchema,
  moviePageSchema,
} from '@frame/contracts';
import {
  tmdbSummarySchema,
  tmdbDetailSchema,
  tmdbGenreSchema,
  tmdbMoviesSchema,
  tmdbImageConfigSchema,
} from './tmdb/tmdb.schemas';
import type {
  TmdbSummary,
  TmdbDetail,
  TmdbMovies,
  TmdbImageConfig,
} from './tmdb/tmdb.schemas';

import { TmdbError } from './tmdb/tmdb.error';
const nullableText = (value: string | null | undefined) =>
  value?.trim() || null;
const positive = (value: number | null | undefined) =>
  value && value > 0 ? value : null;
export function normalizeGenre(input: unknown) {
  return genreSchema.parse(tmdbGenreSchema.parse(input));
}
export function normalizeMovieSummary(
  input: TmdbSummary,
  configuration: TmdbImageConfig,
) {
  const movie = tmdbSummarySchema.parse(input);
  const config = tmdbImageConfigSchema.parse(configuration).images;
  const externalUrl = `https://www.themoviedb.org/movie/${movie.id}`;
  return movieSummarySchema.parse({
    id: movie.id,
    source: 'tmdb',
    title: movie.title,
    releaseDate: movie.release_date || null,
    posterUrl: movie.poster_path
      ? `${config.secure_base_url}w500${movie.poster_path}`
      : null,
    backdropUrl: movie.backdrop_path
      ? `${config.secure_base_url}w1280${movie.backdrop_path}`
      : null,
    genreIds: movie.genre_ids,
    voteAverage: movie.vote_average ?? null,
    voteCount: movie.vote_count,
    overview: nullableText(movie.overview),
    externalUrl,
    attribution: { provider: 'tmdb', sourceUrl: externalUrl },
  });
}
export function normalizeMovieDetail(
  input: TmdbDetail,
  config: TmdbImageConfig,
) {
  const movie = tmdbDetailSchema.parse(input);
  const summary = normalizeMovieSummary(
    { ...movie, genre_ids: movie.genres.map((genre) => genre.id) },
    config,
  );
  const trailer = movie.videos?.results.find(
    (video) =>
      video.site === 'YouTube' &&
      video.type === 'Trailer' &&
      video.official &&
      /^[A-Za-z0-9_-]{11}$/.test(video.key),
  );
  return movieDetailSchema.parse({
    ...summary,
    runtimeMinutes: positive(movie.runtime),
    directors: (movie.credits?.crew ?? [])
      .filter((person) => person.job === 'Director')
      .map(({ id, name }) => ({ id, name })),
    cast: [...(movie.credits?.cast ?? [])]
      .sort((a, b) => a.order - b.order)
      .slice(0, 10)
      .map(({ id, name, character }) => ({
        id,
        name,
        character: nullableText(character),
      })),
    countries: (movie.production_countries ?? []).map((country) => ({
      code: country.iso_3166_1,
      name: country.name,
    })),
    languages: (movie.spoken_languages ?? []).map((language) => ({
      code: language.iso_639_1,
      name: nullableText(language.english_name),
    })),
    // Financial display rights are unverified. Do not publish amounts until verified.
    budgetUsd: null,
    revenueUsd: null,
    trailerUrl: trailer
      ? `https://www.youtube.com/watch?v=${trailer.key}`
      : null,
    externalLinks: [{ label: 'TMDB', url: summary.externalUrl }],
  });
}
export function normalizeMoviePage(
  input: TmdbMovies,
  config: TmdbImageConfig,
  requestedPage: number,
  trending = false,
) {
  const page = tmdbMoviesSchema.parse(input);
  if (page.page !== requestedPage) throw new TmdbError('UNEXPECTED_RESPONSE');
  return moviePageSchema.parse({
    items: page.results.map((movie) => normalizeMovieSummary(movie, config)),
    page: page.page,
    pageSize: 20,
    // Trending reports upstream totals without implying that pages >1 are requestable.
    totalPages: trending ? page.total_pages : Math.min(page.total_pages, 500),
    totalResults: trending
      ? page.total_results
      : Math.min(page.total_results, 10000),
  });
}
