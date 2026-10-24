import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import type { MoviePreview } from '../model';
import { cn } from '@/lib/utils';
export function MovieCard({
  movie,
  variant = 'landscape',
  recognition = false,
}: {
  movie: MoviePreview;
  variant?: 'landscape' | 'poster';
  recognition?: boolean;
}) {
  const artwork = variant === 'poster' ? movie.poster : movie.backdrop;
  return (
    <article className={cn('movie-card', `movie-card-${variant}`)}>
      <a
        href={movie.exploreUrl}
        aria-label={`Explore ${movie.title} on Blender Studio`}
        className="movie-card-link group"
        draggable={false}
      >
        <div className="movie-image">
          <Image
            src={artwork.src}
            alt=""
            fill
            draggable={false}
            sizes={
              variant === 'poster'
                ? '(max-width: 767px) 42vw, (max-width: 1023px) 22vw, (max-width: 1279px) 20vw, 17vw'
                : '(max-width: 767px) 78vw, (max-width: 1023px) 40vw, (max-width: 1279px) 30vw, 22vw'
            }
            style={{ objectFit: 'cover', objectPosition: artwork.position }}
          />
          <div className="movie-image-shade" />
          <span className="card-explore" aria-hidden="true">
            <ArrowUpRight className="size-5" />
          </span>
          {variant === 'poster' && (
            <div className="poster-title" aria-hidden="true">
              <p>{movie.title}</p>
            </div>
          )}
        </div>
        <div className="movie-card-heading">
          <h3>{movie.title}</h3>
          <span>{movie.year}</span>
        </div>
        <p className="movie-genres">{movie.genres[0]}</p>
      </a>
      {recognition && movie.recognition && (
        <a href={movie.recognition.sourceUrl} className="recognition-link">
          {movie.recognition.label}
          <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
