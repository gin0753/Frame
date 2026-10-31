import 'server-only';
import type { Genre, MovieSummary } from '@frame/contracts';
import {
  getTrendingMovies,
  getPopularMovies,
  getCatalogGenres,
  getMovieDetail,
} from '@/lib/server/catalog';
import { toMoviePreview } from './catalog-adapter';
import { movieImageFallbacks } from './image-fallbacks';
import { distinctMovies, selectHomepage } from './homepage-selection';

export type Source<T> =
  { status: 'success' | 'empty'; data: T } | { status: 'failure' };
async function settle<T>(
  read: () => Promise<T>,
  empty: (data: T) => boolean,
): Promise<Source<T>> {
  try {
    const data = await read();
    return { status: empty(data) ? 'empty' : 'success', data };
  } catch {
    return { status: 'failure' };
  }
}

/** Promises belong to this render only; no provider content survives the request. */
export function createHomepageData() {
  const trending = settle(
    () => getTrendingMovies(),
    (page) => !page.items.length,
  );
  const popular = settle(
    () => getPopularMovies(),
    (page) => !page.items.length,
  );
  const genres = settle(
    () => getCatalogGenres(),
    (dictionary) => !dictionary.items.length,
  );
  const selection = Promise.all([trending, popular]).then(([t, p]) =>
    selectHomepage(
      t.status === 'failure' ? [] : t.data.items,
      p.status === 'failure' ? [] : p.data.items,
    ),
  );
  const trendingSelection = trending.then((t) =>
    selectHomepage(t.status === 'failure' ? [] : t.data.items, []),
  );
  const dictionary = genres.then((g): readonly Genre[] =>
    g.status === 'failure' ? [] : g.data.items,
  );
  const adapt = (items: readonly MovieSummary[], names: readonly Genre[]) =>
    items.map((item) => toMoviePreview(item, names, movieImageFallbacks).movie);
  return {
    trending: Promise.all([trending, trendingSelection, dictionary]).then(
      ([source, selected, names]) =>
        source.status === 'failure'
          ? { status: 'failure' as const }
          : { status: source.status, data: adapt(selected.trending, names) },
    ),
    popular: Promise.all([popular, selection, dictionary]).then(
      ([source, selected, names]) =>
        source.status === 'failure'
          ? { status: 'failure' as const }
          : { status: source.status, data: adapt(selected.popular, names) },
    ),
    hero: (async () => {
      const { hero } = await trendingSelection;
      if (!hero) return null;
      const detail = await settle(
        () => getMovieDetail({ tmdbMovieId: String(hero.id) }),
        () => false,
      );
      const names = await dictionary;
      // The consumer hides HTTP status, so a failed detail cannot prove absence.
      const enrichment =
        detail.status !== 'failure' && detail.data.id === hero.id
          ? detail.data
          : undefined;
      return toMoviePreview(hero, names, movieImageFallbacks, enrichment).movie;
    })(),
    genres: Promise.all([trending, popular, genres]).then(([t, p, g]) => {
      if (
        g.status === 'failure' ||
        (t.status === 'failure' && p.status === 'failure')
      )
        return { status: 'failure' as const };
      const pool = distinctMovies([
        ...(t.status === 'failure' ? [] : t.data.items),
        ...(p.status === 'failure' ? [] : p.data.items),
      ]);
      const ids = new Set(pool.flatMap((movie) => movie.genreIds));
      return {
        status: pool.length ? ('success' as const) : ('empty' as const),
        data: adapt(pool, g.data.items),
        choices: g.data.items
          .filter(({ id }) => ids.has(id))
          .map(({ name }) => name),
        partial: t.status === 'failure' || p.status === 'failure',
      };
    }),
  };
}
export type HomepageData = ReturnType<typeof createHomepageData>;
