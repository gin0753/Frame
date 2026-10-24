import type { MoviePreview } from './model';
export function formatRuntime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return minutes < 60
    ? remaining
      ? `${minutes}m ${remaining}s`
      : `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function moviesByGenre(movies: readonly MoviePreview[], genre: string) {
  return genre === 'All'
    ? movies
    : movies.filter((movie) => movie.genres.includes(genre));
}
