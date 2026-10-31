import type { MovieSummary } from '@frame/contracts';
import { movieSummarySchema } from '@frame/contracts';
import { toMoviePreview } from './catalog-adapter';
import { movieImageFallbacks } from './image-fallbacks';

export function distinctMovies(items: readonly MovieSummary[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (!movieSummarySchema.safeParse(item).success || seen.has(item.id))
      return false;
    seen.add(item.id);
    return true;
  });
}

export function selectHomepage(
  trendingItems: readonly MovieSummary[],
  popularItems: readonly MovieSummary[],
) {
  const trending = distinctMovies(trendingItems);
  const hero = trending.find((item) => {
    const movie = toMoviePreview(item, [], movieImageFallbacks).movie;
    return (
      movie.backdrop.src !== movieImageFallbacks.backdrop.src &&
      movie.exploreUrl === `https://www.themoviedb.org/movie/${item.id}`
    );
  });
  const withoutHero = trending.filter(({ id }) => id !== hero?.id);
  const trendingRail = withoutHero.length >= 4 ? withoutHero : trending;
  const excluded = new Set([
    ...trendingRail.map(({ id }) => id),
    ...(hero ? [hero.id] : []),
  ]);
  const popular = distinctMovies(popularItems);
  const unique = popular.filter(({ id }) => !excluded.has(id));
  return {
    hero,
    trending: trendingRail,
    popular: unique.length >= 4 ? unique : popular,
  };
}
