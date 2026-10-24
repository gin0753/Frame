import { Carousel } from '@/components/ui/carousel';
import type { MoviePreview } from '../model';
import { MovieCard } from './movie-card';
export function MovieRail({
  id,
  title,
  eyebrow,
  description,
  movies,
  variant = 'landscape',
  recognition = false,
}: {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  movies: readonly MoviePreview[];
  variant?: 'landscape' | 'poster';
  recognition?: boolean;
}) {
  const heading = (
    <div className="rail-heading">
      <p className="sr-only">{eyebrow}</p>
      <h2 id={`${id}-heading`}>{title}</h2>
      <p className="rail-description">{description}</p>
    </div>
  );
  return (
    <section
      id={id}
      className="film-section container-shell"
      aria-labelledby={`${id}-heading`}
    >
      {movies.length ? (
        <Carousel label={title} variant={variant} heading={heading}>
          {movies.map((movie, index) => (
            <div
              className="rail-slide"
              key={movie.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${movies.length}`}
            >
              <MovieCard
                movie={movie}
                variant={variant}
                recognition={recognition}
              />
            </div>
          ))}
        </Carousel>
      ) : (
        <>
          {heading}
          <p className="rail-empty">
            No films in this selection yet. Explore another collection below.
          </p>
        </>
      )}
    </section>
  );
}
