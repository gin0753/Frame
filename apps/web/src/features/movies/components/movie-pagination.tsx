import styles from './movie-pagination.module.css';

export function MoviePagination({
  currentPage,
  totalPages,
  previousUrl,
  nextUrl,
}: {
  currentPage: number;
  totalPages: number;
  previousUrl?: string;
  nextUrl?: string;
}) {
  if (totalPages <= 1 || currentPage > totalPages) return null;
  return (
    <nav className={styles.pagination} aria-label="Movie result pages">
      {previousUrl ? (
        <a href={previousUrl} rel="prev">
          Previous
        </a>
      ) : (
        <span>Previous</span>
      )}
      <p>
        Page {currentPage} of {totalPages}
      </p>
      {nextUrl ? (
        <a href={nextUrl} rel="next">
          Next
        </a>
      ) : (
        <span>Next</span>
      )}
    </nav>
  );
}
