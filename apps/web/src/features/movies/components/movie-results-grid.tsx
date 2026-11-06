import { MovieCard } from './movie-card';
import type { MoviePreview } from '../model';
import styles from './movie-results-grid.module.css';
export function MovieResultsGrid({
  movies,
}: {
  movies: readonly MoviePreview[];
}) {
  return (
    <div className={styles.grid}>
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          variant="poster"
          labelMetadata
          sizes="(max-width: 767px) 44vw, (max-width: 1023px) 30vw, (max-width: 1279px) 22vw, 18vw"
        />
      ))}
    </div>
  );
}
export function MovieResultsSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i}>
          <div className="skeleton skeleton-poster" />
          <div className="skeleton skeleton-caption" />
        </div>
      ))}
    </div>
  );
}
