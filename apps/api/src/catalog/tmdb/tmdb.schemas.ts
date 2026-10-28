import { z } from 'zod';

// Provider additions are stripped; malformed known fields fail closed.
const id = z.number().int().positive().max(2147483647);
const text = z.string().trim().min(1);
const optionalText = z.string().nullable().optional();
const path = z
  .union([
    z.string().regex(/^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/),
    z.literal(''),
  ])
  .nullable()
  .optional();
const movie = z.object({
  id,
  title: text,
  release_date: z
    .union([z.iso.date(), z.literal('')])
    .nullable()
    .optional(),
  poster_path: path,
  backdrop_path: path,
  overview: optionalText,
  vote_average: z.number().min(0).max(10).nullable().optional(),
  vote_count: z.number().int().nonnegative(),
});
export const tmdbGenreSchema = z.object({ id, name: text });
export const tmdbSummarySchema = movie.extend({
  genre_ids: z.array(id),
  media_type: z.literal('movie').optional(),
});
export const tmdbMoviesSchema = z
  .object({
    page: z.number().int().positive().max(500),
    results: z.array(tmdbSummarySchema).max(20),
    total_pages: z.number().int().nonnegative(),
    total_results: z.number().int().nonnegative(),
  })
  .refine((page) => {
    if (page.total_results === 0)
      return page.total_pages === 0 && page.results.length === 0;
    if (page.total_pages !== Math.ceil(page.total_results / 20)) return false;
    const expected =
      page.page > page.total_pages
        ? 0
        : Math.min(20, page.total_results - (page.page - 1) * 20);
    return page.results.length === expected;
  });
export const tmdbGenresSchema = z.object({ genres: z.array(tmdbGenreSchema) });
const person = z.object({ id, name: text });
export const tmdbDetailSchema = movie.extend({
  genres: z.array(tmdbGenreSchema),
  runtime: z.number().int().nonnegative().nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().int().nonnegative().nullable().optional(),
  production_countries: z
    .array(z.object({ iso_3166_1: z.string().regex(/^[A-Z]{2}$/), name: text }))
    .nullable()
    .optional(),
  spoken_languages: z
    .array(
      z.object({
        iso_639_1: z.string().regex(/^[a-z]{2}$/),
        english_name: optionalText,
      }),
    )
    .nullable()
    .optional(),
  credits: z
    .object({
      crew: z.array(person.extend({ job: text })),
      cast: z.array(
        person.extend({
          character: optionalText,
          order: z.number().int().nonnegative(),
        }),
      ),
    })
    .nullable()
    .optional(),
  videos: z
    .object({
      results: z.array(
        z.object({
          id: text,
          key: text,
          site: text,
          type: text,
          official: z.boolean(),
        }),
      ),
    })
    .nullable()
    .optional(),
});
export const tmdbImageConfigSchema = z.object({
  images: z.object({
    secure_base_url: z.literal('https://image.tmdb.org/t/p/'),
    poster_sizes: z.array(z.string()).refine((sizes) => sizes.includes('w500')),
    backdrop_sizes: z
      .array(z.string())
      .refine((sizes) => sizes.includes('w1280')),
  }),
});
export type TmdbMovies = z.infer<typeof tmdbMoviesSchema>;
export type TmdbGenres = z.infer<typeof tmdbGenresSchema>;
export type TmdbDetail = z.infer<typeof tmdbDetailSchema>;
export type TmdbSummary = z.infer<typeof tmdbSummarySchema>;
export type TmdbImageConfig = z.infer<typeof tmdbImageConfigSchema>;
