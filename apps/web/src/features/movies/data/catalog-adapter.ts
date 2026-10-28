import {
  movieSummarySchema,
  movieDetailSchema,
  genresResponseSchema,
} from '@frame/contracts';
import type { MovieSummary, MovieDetail, Genre } from '@frame/contracts';
import type { MovieImage, MoviePreview } from '../model';

/** Pure boundary; local neutral fallback assets are supplied by composition after Stage 2.4 verification. */
export function toMoviePreview(
  input: MovieSummary,
  genres: readonly Genre[],
  fallbacks: { poster: MovieImage; backdrop: MovieImage },
  detail?: MovieDetail,
): { movie: MoviePreview; tmdbMovieId: number; genreIds: readonly number[] } {
  const summary = movieSummarySchema.parse(input);
  const dictionary = new Map(
    genresResponseSchema
      .parse({ items: genres })
      .items.map((genre) => [genre.id, genre.name]),
  );
  const enrichment = detail ? movieDetailSchema.parse(detail) : undefined;
  if (enrichment && enrichment.id !== summary.id)
    throw new Error('Movie detail identity mismatch');
  return {
    tmdbMovieId: summary.id,
    genreIds: [...summary.genreIds],
    movie: {
      id: `tmdb:${summary.id}`,
      title: summary.title,
      year: summary.releaseDate
        ? Number(summary.releaseDate.slice(0, 4))
        : null,
      genres: summary.genreIds.flatMap((id) =>
        dictionary.has(id) ? [dictionary.get(id)!] : [],
      ),
      synopsis: summary.overview ?? '',
      runtimeSeconds: enrichment?.runtimeMinutes
        ? enrichment.runtimeMinutes * 60
        : null,
      // These are selected presentation ratios, not claimed original image dimensions.
      poster: summary.posterUrl
        ? { src: summary.posterUrl, width: 500, height: 750 }
        : { ...fallbacks.poster },
      backdrop: summary.backdropUrl
        ? { src: summary.backdropUrl, width: 1280, height: 720 }
        : { ...fallbacks.backdrop },
      exploreUrl: summary.externalUrl,
      destinationLabel: 'TMDB',
    },
  };
}
