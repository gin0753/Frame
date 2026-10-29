import {
  movieSummarySchema,
  movieDetailSchema,
  genresResponseSchema,
} from '@frame/contracts';
import type { MovieSummary, MovieDetail, Genre } from '@frame/contracts';
import type { MovieImage, MoviePreview } from '../model';

function artwork(
  url: string | null,
  size: 'w500' | 'w1280',
  fallback: MovieImage,
): MovieImage {
  // Public URL syntax alone does not establish an approved artwork source.
  // Unusable artwork falls back without making the movie/link unusable.
  const safe =
    url &&
    new RegExp(
      `^https://image\\.tmdb\\.org/t/p/${size}/[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`,
    ).test(url);
  return safe
    ? {
        src: url,
        width: size === 'w500' ? 500 : 1280,
        height: size === 'w500' ? 750 : 720,
      }
    : { ...fallback };
}

/** Pure boundary; composition may supply the verified FRAME-owned movieImageFallbacks. */
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
      poster: artwork(summary.posterUrl, 'w500', fallbacks.poster),
      backdrop: artwork(summary.backdropUrl, 'w1280', fallbacks.backdrop),
      exploreUrl: summary.externalUrl,
      destinationLabel: 'TMDB',
    },
  };
}
