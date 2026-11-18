import type { Metadata } from 'next';
import type { GenresResponse } from '@frame/contracts';
import { Suspense } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { MovieResultsSkeleton } from '@/features/movies/components/movie-results-grid';
import {
  parseDiscoverParams,
  discoverSortLabels,
} from '@/features/movies/data/discover-params';
import { getCatalogGenres } from '@/lib/server/catalog';
import { DiscoverResults } from './discover-results';
import styles from './discover.module.css';

export const metadata: Metadata = {
  title: 'Discover films — FRAME',
  description: 'Explore films by genre, release year and sort order.',
  robots: { index: false, follow: true },
};

function GenreFallback({
  selected,
  invalid,
}: {
  selected: string;
  invalid: boolean;
}) {
  return (
    <>
      <select
        id="discover-genre"
        disabled
        defaultValue={selected}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'genreId-error' : undefined}
      >
        <option value={selected}>
          {selected ? `Genre ID ${selected} — loading` : 'Loading genres…'}
        </option>
      </select>
      {selected && <input type="hidden" name="genreId" value={selected} />}
    </>
  );
}
async function GenreOptions({
  request,
  selected,
  invalid,
}: {
  request: Promise<GenresResponse | null>;
  selected: string;
  invalid: boolean;
}) {
  const dictionary = await request;
  const known = dictionary?.items.some(
    (genre) => String(genre.id) === selected,
  );
  if (!dictionary)
    return (
      <>
        <select
          id="discover-genre"
          disabled
          defaultValue={selected}
          aria-invalid={invalid || undefined}
          aria-describedby={
            invalid ? 'genre-availability genreId-error' : 'genre-availability'
          }
        >
          <option value={selected}>
            {selected ? `Genre ID ${selected}` : 'Genres unavailable'}
          </option>
        </select>
        {selected && <input type="hidden" name="genreId" value={selected} />}
        <p id="genre-availability" className={styles.help}>
          Genre options are temporarily unavailable.{' '}
          {selected
            ? 'Your selected genre is retained. Use Apply to retry or Reset to clear filters.'
            : 'Year and sort filters remain available. Use Apply to retry.'}
        </p>
      </>
    );
  const unknown = Boolean(selected && !known);
  return (
    <>
      <select
        id="discover-genre"
        name="genreId"
        defaultValue={selected}
        aria-invalid={invalid || unknown || undefined}
        aria-describedby={
          invalid ? 'genreId-error' : unknown ? 'genre-unknown' : undefined
        }
      >
        <option value="">All genres</option>
        {unknown && (
          <option value={selected}>Unavailable genre ({selected})</option>
        )}
        {dictionary.items.map((genre) => (
          <option key={genre.id} value={genre.id}>
            {genre.name}
          </option>
        ))}
      </select>
      {unknown && !invalid && (
        <p id="genre-unknown" className={styles.error}>
          Choose an available genre.
        </p>
      )}
    </>
  );
}
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fields, errors, query } = parseDiscoverParams(await searchParams);
  // Request-local snapshot: optional labels never delay movie results. The promise is observed immediately.
  const dictionary: { current: GenresResponse | null } = { current: null };
  const genresRequest = getCatalogGenres().then(
    (value) => {
      dictionary.current = value;
      return value;
    },
    () => null,
  );
  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} className={styles.error}>
        {errors[key]}
      </p>
    ) : null;
  const badSort = !Object.hasOwn(discoverSortLabels, fields.sort);
  return (
    <>
      <Header context="discover" />
      <main id="main" className={`container-shell ${styles.main}`}>
        <h1 className={styles.title}>Discover films</h1>
        <p className={styles.description}>Find your next film.</p>
        <form
          action="/discover"
          method="get"
          aria-label="Discover filters"
          className={styles.form}
        >
          <div className={styles.field}>
            <label htmlFor="discover-genre">Genre</label>
            <div>
              <Suspense
                fallback={
                  <GenreFallback
                    selected={fields.genreId}
                    invalid={Boolean(errors.genreId)}
                  />
                }
              >
                <GenreOptions
                  request={genresRequest}
                  selected={fields.genreId}
                  invalid={Boolean(errors.genreId)}
                />
              </Suspense>
              {fieldError('genreId')}
            </div>
          </div>
          <fieldset>
            <legend className="sr-only">Release year</legend>
            <div className={styles.years}>
              <label htmlFor="discover-yearFrom">From year</label>
              <label htmlFor="discover-yearTo">To year</label>
            </div>
            <div className={styles.years}>
              {(['yearFrom', 'yearTo'] as const).map((key) => (
                <div key={key}>
                  <input
                    id={`discover-${key}`}
                    name={key}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    defaultValue={fields[key]}
                    placeholder={key === 'yearFrom' ? '1800' : '2100'}
                    aria-invalid={Boolean(errors[key]) || undefined}
                    aria-describedby={
                      errors[key] ? `${key}-error year-help` : 'year-help'
                    }
                  />
                  {fieldError(key)}
                </div>
              ))}
              <p id="year-help" className={`${styles.help} ${styles.yearHelp}`}>
                Optional · 1800–2100
              </p>
            </div>
          </fieldset>
          <div className={styles.field}>
            <label htmlFor="discover-sort">Sort</label>
            <div>
              <select
                id="discover-sort"
                name="sort"
                defaultValue={fields.sort}
                aria-invalid={Boolean(errors.sort) || undefined}
                aria-describedby={
                  errors.sort ? 'sort-error sort-help' : 'sort-help'
                }
              >
                {badSort && (
                  <option value={fields.sort}>Unsupported sort</option>
                )}
                {Object.entries(discoverSortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p id="sort-help" className={styles.help}>
                Newest includes upcoming films; Top Rated uses TMDB ratings with
                100+ votes.
              </p>
              {fieldError('sort')}
            </div>
          </div>
          <div className={styles.actions}>
            <Button type="submit">Apply</Button>
            <Button variant="ghost" asChild>
              <a href="/discover">Reset</a>
            </Button>
          </div>
        </form>
        <div className={styles.results}>
          {!query ? (
            <section
              className={styles.state}
              aria-labelledby="filter-validation"
            >
              <h2 id="filter-validation">Check your filters</h2>
              <ul>
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>
                    {['genreId', 'yearFrom', 'yearTo', 'sort'].includes(key) ? (
                      <a
                        href={`#discover-${key === 'genreId' ? 'genre' : key}`}
                      >
                        {message}
                      </a>
                    ) : (
                      message
                    )}
                  </li>
                ))}
              </ul>
              <a href="/discover">Reset filters</a>
            </section>
          ) : (
            <Suspense
              key={JSON.stringify(query)}
              fallback={
                <section aria-busy="true" aria-label="Discover results">
                  <h2>Films to discover</h2>
                  <p role="status" className={styles.summary}>
                    Loading films…
                  </p>
                  <MovieResultsSkeleton />
                </section>
              }
            >
              <DiscoverResults query={query} dictionary={dictionary} />
            </Suspense>
          )}
        </div>
      </main>
      <Footer homeHref="/#discover" />
    </>
  );
}
