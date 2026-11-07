import type { DiscoverQuery, GenresResponse } from '@frame/contracts';
import { Button } from '@/components/ui/button';
import { MovieResultsGrid } from '@/features/movies/components/movie-results-grid';
import { toMoviePreview } from '@/features/movies/data/catalog-adapter';
import { movieImageFallbacks } from '@/features/movies/data/image-fallbacks';
import { discoverSortLabels } from '@/features/movies/data/discover-params';
import { CatalogReadError, discoverMovies } from '@/lib/server/catalog';
import styles from './discover.module.css';
import { MoviePagination } from '@/features/movies/components/movie-pagination';
import { discoverPageUrl } from '@/features/movies/data/discover-params';

export function DiscoverRetry({ query }: { query: DiscoverQuery }) {
  return (
    <form action="/discover" method="get">
      {Object.entries(query)
        .filter(([, value]) => value)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <Button variant="secondary" type="submit">
        Try again
      </Button>
    </form>
  );
}
export async function DiscoverResults({
  query,
  dictionary,
}: {
  query: DiscoverQuery;
  dictionary: { current: GenresResponse | null };
}) {
  let page;
  try {
    page = await discoverMovies(query);
  } catch (error) {
    const status = error instanceof CatalogReadError ? error.status : 503;
    return (
      <section
        className={styles.state}
        aria-labelledby="discover-state-heading"
      >
        <h2 id="discover-state-heading">
          {status === 400
            ? 'Check your filters'
            : status === 429
              ? 'Discover is temporarily busy.'
              : 'Films are temporarily unavailable.'}
        </h2>
        <p>
          {status === 400
            ? 'Choose an available genre. The requested filter has not been removed.'
            : 'Please try again shortly. If a genre was selected, it has been retained.'}
        </p>
        {status !== 400 && <DiscoverRetry query={query} />}
        <a href="/discover">Reset filters</a>
      </section>
    );
  }
  const genres = dictionary.current?.items ?? [];
  const genre = query.genreId
    ? (genres.find((g) => g.id === Number(query.genreId))?.name ??
      `Genre ID ${query.genreId}`)
    : null;
  const years =
    query.yearFrom && query.yearTo
      ? `${query.yearFrom}–${query.yearTo}`
      : query.yearFrom
        ? `From ${query.yearFrom}`
        : query.yearTo
          ? `Through ${query.yearTo}`
          : null;
  return (
    <section aria-labelledby="discover-results-heading">
      <h2 id="discover-results-heading">Films to discover</h2>
      <p className={styles.summary}>
        {[genre, years, discoverSortLabels[query.sort]]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {page.items.length ? (
        <>
          <p className={styles.summary}>
            Showing {page.items.length}{' '}
            {page.items.length === 1 ? 'film' : 'films'}.
          </p>

          <MovieResultsGrid
            movies={page.items.map(
              (movie) =>
                toMoviePreview(movie, genres, movieImageFallbacks).movie,
            )}
          />
        </>
      ) : (
        <div className={styles.state}>
          {page.page === 1 && page.totalResults === 0 ? (
            <>
              <p>No films match these filters.</p>
              <p>Try another genre or broaden the release years.</p>
              <a href="/discover">Reset filters</a>
            </>
          ) : (
            <>
              <p>
                {page.page > page.totalPages
                  ? 'This page is no longer available for these filters.'
                  : 'No films were returned on this page.'}
              </p>
              <a href={discoverPageUrl(query)}>Return to page 1</a>
            </>
          )}
        </div>
      )}
      {page.page <= page.totalPages && (
        <MoviePagination
          currentPage={page.page}
          totalPages={page.totalPages}
          previousUrl={
            page.page > 1 ? discoverPageUrl(query, page.page - 1) : undefined
          }
          nextUrl={
            page.page < page.totalPages
              ? discoverPageUrl(query, page.page + 1)
              : undefined
          }
        />
      )}
    </section>
  );
}
