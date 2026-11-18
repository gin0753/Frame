import { Button } from '@/components/ui/button';
import { MovieResultsGrid } from '@/features/movies/components/movie-results-grid';
import { toMoviePreview } from '@/features/movies/data/catalog-adapter';
import { movieImageFallbacks } from '@/features/movies/data/image-fallbacks';
import {
  CatalogReadError,
  getCatalogGenres,
  searchMovies,
} from '@/lib/server/catalog';
import styles from './search.module.css';
import { MoviePagination } from '@/features/movies/components/movie-pagination';
import { searchPageUrl } from '@/features/movies/data/search-params';
export async function SearchResults({
  q,
  requestedPage = '1',
}: {
  q: string;
  requestedPage?: string;
}) {
  const searchRequest = Promise.allSettled([searchMovies(q, requestedPage)]);
  // Observe rejection immediately, even when Search returns before enrichment.
  const genresRequest = getCatalogGenres().catch(() => ({ items: [] }));
  const [result] = await searchRequest;
  if (result.status === 'rejected') {
    const limited =
      result.reason instanceof CatalogReadError && result.reason.status === 429;
    return (
      <section className={styles.state} aria-labelledby="search-state-heading">
        <h2 id="search-state-heading">
          {limited
            ? 'Search is temporarily busy'
            : 'Film search is temporarily unavailable'}
        </h2>
        <p>
          {limited
            ? 'Please try again shortly.'
            : 'Please try your search again.'}
        </p>
        {/* A native GET submission bypasses the client router cache, including same-URL retries. */}
        <form action="/search" method="get">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="page" value={requestedPage} />
          <Button variant="secondary" type="submit">
            Try again
          </Button>
        </form>
      </section>
    );
  }
  const page = result.value;
  const genres = page.items.some((movie) => movie.genreIds.length > 0)
    ? (await genresRequest).items
    : [];
  return (
    <section aria-labelledby="search-results-heading">
      <h2 id="search-results-heading" className={styles.resultHeading}>
        Results for “{q}”
      </h2>
      {page.items.length ? (
        <>
          <p className={styles.summary}>
            Showing {page.items.length}{' '}
            {page.items.length === 1 ? 'film' : 'films'}.
          </p>

          <MovieResultsGrid
            movies={page.items.map(
              (summary) =>
                toMoviePreview(summary, genres, movieImageFallbacks).movie,
            )}
          />
        </>
      ) : (
        <div className={styles.state}>
          {page.page === 1 && page.totalResults === 0 ? (
            <>
              <p>No films found for &ldquo;{q}&rdquo;.</p>
              <p>Try another title or check the spelling.</p>
            </>
          ) : (
            <>
              <p>
                {page.page > page.totalPages
                  ? 'This page is no longer available for this search.'
                  : 'No films were returned on this page.'}
              </p>
              <a href={searchPageUrl(q)}>Return to page 1</a>
            </>
          )}
        </div>
      )}
      {page.page <= page.totalPages && (
        <MoviePagination
          currentPage={page.page}
          totalPages={page.totalPages}
          pageUrl={(target) => searchPageUrl(q, target)}
        />
      )}
    </section>
  );
}
