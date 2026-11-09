import styles from './movie-pagination.module.css';
import { paginationItems } from '../data/pagination';

export function MoviePagination({
  currentPage,
  totalPages,
  pageUrl,
}: {
  currentPage: number;
  totalPages: number;
  pageUrl: (page: number) => string;
}) {
  if (totalPages <= 1 || currentPage > totalPages) return null;
  // GET replaces the action query. Reuse the route builder's page-one tuple
  // as successful controls; it contains no page field or unapplied edits.
  const [action, query] = pageUrl(1).split('?');
  const fields = new URLSearchParams(query);
  const numbers = (radius: number, className: string) => (
    <ol className={className}>
      {paginationItems(currentPage, totalPages, radius).map((item, i) => (
        <li key={item === 'ellipsis' ? `gap-${i}` : item}>
          {item === 'ellipsis' ? (
            <span aria-hidden="true">…</span>
          ) : item === currentPage ? (
            <span
              className={styles.current}
              aria-current="page"
              aria-label={`Current page, ${item}`}
            >
              {item}
            </span>
          ) : (
            <a href={pageUrl(item)} aria-label={`Page ${item}`}>
              {item}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
  return (
    <nav className={styles.pagination} aria-label="Movie result pages">
      <div className={styles.links}>
        {currentPage > 1 && (
          <a
            className={styles.previous}
            href={pageUrl(currentPage - 1)}
            rel="prev"
          >
            Previous
          </a>
        )}
        <p className={styles.indicator}>
          Page {currentPage} of {totalPages}
        </p>
        {numbers(1, styles.tablet)}
        {numbers(2, styles.desktop)}
        {currentPage < totalPages && (
          <a className={styles.next} href={pageUrl(currentPage + 1)} rel="next">
            Next
          </a>
        )}
      </div>
      <form
        action={action}
        method="get"
        className={styles.jump}
        aria-label="Jump to page"
      >
        {[...fields].map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label htmlFor="movie-page-jump">Page</label>
        <input
          id="movie-page-jump"
          name="page"
          type="number"
          required
          min={1}
          max={totalPages}
          step={1}
          defaultValue={currentPage}
          aria-describedby="movie-page-range"
        />
        <span className={styles.total}>of {totalPages}</span>
        <button type="submit">Go</button>
        <span id="movie-page-range" className={styles.rangeDescription}>
          Enter a whole page from 1 to {totalPages}.
        </span>
      </form>
    </nav>
  );
}
