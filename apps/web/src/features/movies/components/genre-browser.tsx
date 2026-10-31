'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MoviePreview } from '../model';
import { moviesByGenre } from '../presentation';
import { MovieCard } from './movie-card';
import { cn } from '@/lib/utils';

export function GenreBrowser({
  movies,
  genres = [...new Set(movies.flatMap((movie) => movie.genres))],
  description = 'Find a film for your mood.',
}: {
  movies: readonly MoviePreview[];
  genres?: readonly string[];
  description?: string;
}) {
  const [genre, setGenre] = useState('All');
  const results = useRef<HTMLDetailsElement>(null);
  const resultsViewport = useRef<HTMLDivElement>(null);
  const filtered = moviesByGenre(movies, genre);
  useLayoutEffect(() => {
    const viewport = resultsViewport.current;
    if (!viewport) return;
    // New cards are committed. Clear the old snap target before resetting this row.
    const snapType = viewport.style.scrollSnapType;
    viewport.style.scrollSnapType = 'none';
    viewport.scrollLeft = 0;
    const frame = requestAnimationFrame(() => {
      viewport.style.scrollSnapType = snapType;
    });
    return () => {
      cancelAnimationFrame(frame);
      viewport.style.scrollSnapType = snapType;
    };
  }, [genre]);
  function selectGenre(next: string) {
    setGenre(next);
    // Open the native disclosure without moving keyboard focus off the filter.
    if (results.current) results.current.open = true;
  }
  return (
    <section
      id="genres"
      className="film-section genre-section container-shell"
      aria-labelledby="genres-heading"
    >
      <div className="genre-intro">
        <h2 id="genres-heading">Browse by Genre</h2>
        <p>{description}</p>
      </div>
      <div
        className="genre-options"
        role="group"
        aria-label="Filter films by genre"
      >
        {genres.map((item) => (
          <button
            key={item}
            aria-label={item === 'Science fiction' ? 'Sci-fi' : item}
            className={cn('genre-filter', genre === item && 'genre-selected')}
            aria-pressed={genre === item}
            aria-controls="genre-results"
            onClick={() => selectGenre(genre === item ? 'All' : item)}
          >
            {item === 'Science fiction' ? 'Sci-fi' : item}
          </button>
        ))}
      </div>
      <div className="genre-result-heading">
        <p role="status" aria-live="polite">
          {genre === 'All' ? 'All films' : genre}{' '}
          <span>
            {' '}
            / {filtered.length} {filtered.length === 1 ? 'film' : 'films'}
          </span>
        </p>
        <button
          onClick={() => selectGenre('All')}
          disabled={genre === 'All'}
          className="reset-filter"
        >
          Show all films
        </button>
      </div>
      <details ref={results} className="genre-disclosure" open>
        <summary>
          View selected films{' '}
          <ChevronDown className="size-4" aria-hidden="true" />
        </summary>
        <div
          id="genre-results"
          ref={resultsViewport}
          className="genre-results"
          role="region"
          aria-label="Genre film results"
          tabIndex={0}
        >
          {filtered.length ? (
            filtered.map((movie) => <MovieCard key={movie.id} movie={movie} />)
          ) : (
            <p className="rail-empty">
              No films in this genre yet. Try another genre.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
