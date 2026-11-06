import { discoverQuerySchema } from '@frame/contracts';
export const discoverSortLabels = {
  popular: 'Most Popular',
  newest: 'Newest release dates, including upcoming',
  rated: 'Highest TMDB Rated · 100+ votes',
} as const;
export function parseDiscoverParams(
  params: Record<string, string | string[] | undefined>,
) {
  const raw = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined),
  );
  const fields = Object.fromEntries(
    ['genreId', 'yearFrom', 'yearTo', 'sort'].map((key) => [
      key,
      typeof params[key] === 'string'
        ? params[key]
        : Array.isArray(params[key])
          ? params[key][0]
          : key === 'sort'
            ? 'popular'
            : '',
    ]),
  ) as Record<'genreId' | 'yearFrom' | 'yearTo' | 'sort', string>;
  const parsed = discoverQuerySchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] =
        key === 'yearTo' && issue.code === 'custom'
          ? issue.message
          : key === 'yearFrom' || key === 'yearTo'
            ? 'Enter a year from 1800 to 2100, using four digits.'
            : key === 'genreId'
              ? 'Choose one valid genre ID.'
              : key === 'sort'
                ? 'Choose an available sort.'
                : key === 'page'
                  ? 'Only page 1 is available.'
                  : 'Use supported filters once each; remove unknown parameters.';
    }
  return { fields, errors, query: parsed.success ? parsed.data : null };
}
