import { MovieResultsSkeleton } from '@/features/movies/components/movie-results-grid';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';

import { parseSearchParams } from '@/features/movies/data/search-params';

import styles from './search.module.css';
import { SearchResults } from './search-results';

export const metadata: Metadata = {
  title: 'Search films — FRAME',
  description: 'Find a film by its title on FRAME.',
  robots: { index: false, follow: true },
};

function LoadingResults() {
  return (
    <section aria-busy="true" aria-label="Search results">
      <p role="status">Searching films…</p>
      <MovieResultsSkeleton />
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseSearchParams(await searchParams);
  const invalid = query.status === 'invalid';
  return (
    <>
      <Header context="search" />
      <main id="main" className={`container-shell ${styles.main}`}>
        <h1 className={styles.title}>Search films</h1>
        <p className={styles.description}>Find a film by its title.</p>
        <form
          action="/search"
          method="get"
          role="search"
          aria-label="Film search"
          className={styles.form}
        >
          <label htmlFor="film-title">Film title</label>
          <div className={styles.controls}>
            <input
              id="film-title"
              type="search"
              name="q"
              defaultValue={query.q}
              maxLength={200}
              placeholder="Enter a film title"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'search-validation' : undefined}
            />
            <Button type="submit" className={styles.submit}>
              Search
            </Button>
          </div>
        </form>
        <div className={styles.results}>
          {query.status === 'initial' ? (
            <p className={styles.summary}>Enter a title to begin.</p>
          ) : invalid ? (
            <div className={styles.state}>
              <h2>Check your search</h2>
              <p id="search-validation">
                Use one film title of up to 200 characters. Use supported
                parameters once each and a whole page number from 1 to 500
                without padding.
              </p>
              <a href="/search">Start a new search</a>
            </div>
          ) : (
            <Suspense
              key={JSON.stringify([query.q, query.page])}
              fallback={<LoadingResults />}
            >
              <SearchResults q={query.q} requestedPage={query.page} />
            </Suspense>
          )}
        </div>
      </main>
      <Footer homeHref="/#discover" />
    </>
  );
}
