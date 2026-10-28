import { z } from 'zod';

// Internal, deliberately minimal provider projections. Full normalization is Stage 2.2.
// Unknown provider fields are discarded; provider additions must not break reads.
const movie = z.object({
  id: z.number().int().positive().max(2147483647),
  title: z.string().min(1),
});
export const tmdbMoviesSchema = z.object({
  page: z.number().int().positive(),
  results: z.array(movie),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
});
export const tmdbGenresSchema = z.object({
  genres: z.array(
    z.object({ id: z.number().int().positive(), name: z.string().min(1) }),
  ),
});
export const tmdbDetailSchema = movie;
export type TmdbMovies = z.infer<typeof tmdbMoviesSchema>;
export type TmdbGenres = z.infer<typeof tmdbGenresSchema>;
export type TmdbDetail = z.infer<typeof tmdbDetailSchema>;
