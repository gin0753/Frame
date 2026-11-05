import { Button } from '@/components/ui/button';
import { MovieCard } from '@/features/movies/components/movie-card';
import { toMoviePreview } from '@/features/movies/data/catalog-adapter';
import { movieImageFallbacks } from '@/features/movies/data/image-fallbacks';
import {
  CatalogReadError,
  getCatalogGenres,
  searchMovies,
} from '@/lib/server/catalog';
import styles from './search.module.css';
export async function SearchResults({ q }: { q: string }) {
  const searchRequest = Promise.allSettled([searchMovies(q)]);
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
          {page.totalPages > 1 && (
            <p className={styles.summary}>
              Only the first page is available in this release.
            </p>
          )}
          <div className={styles.grid}>
            {page.items.map((summary) => (
              <MovieCard
                key={summary.id}
                movie={
                  toMoviePreview(summary, genres, movieImageFallbacks).movie
                }
                variant="poster"
                labelMetadata
                sizes="(max-width: 767px) 44vw, (max-width: 1023px) 30vw, (max-width: 1279px) 22vw, 18vw"
              />
            ))}
          </div>
        </>
      ) : (
        <div className={styles.state}>
          <p>No films found for “{q}”.</p>
          <p>Try another title or check the spelling.</p>
        </div>
      )}
    </section>
  );
}
