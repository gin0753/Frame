import { MovieArtwork } from './movie-artwork';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MoviePreview } from '../model';
import { formatRuntime } from '../presentation';
export function Hero({ movie }: { movie: MoviePreview }) {
  return (
    <section
      id="discover"
      className="cinema-hero"
      aria-labelledby="featured-title"
    >
      <div className="hero-image">
        <MovieArtwork
          artwork={movie.backdrop}
          preload
          sizes="100vw"
          className="hero-backdrop"
        />
      </div>
      <div className="hero-shade" />
      <HeroContent movie={movie} />
    </section>
  );
}

/** One shared presentation for the static fixture Hero and live carousel. */
export function HeroContent({
  movie,
  active = true,
}: {
  movie: MoviePreview;
  active?: boolean;
}) {
  const Heading = active ? 'h1' : 'div';
  const runtime = formatRuntime(movie.runtimeSeconds);
  return (
    <div
      className={`hero-content container-shell ${active ? '' : 'hero-content-inactive'}`}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
    >
      <p className="eyebrow hero-kicker">Featured film</p>
      <Heading
        id={active ? 'featured-title' : undefined}
        className="hero-title"
      >
        {movie.title}
      </Heading>
      {movie.synopsis && <p className="hero-overview">{movie.synopsis}</p>}
      <div className="hero-metadata">
        {movie.year !== null && <span>{movie.year}</span>}
        {movie.genres.length > 0 && <span>{movie.genres.join(' / ')}</span>}
        {runtime && <span>{runtime}</span>}
      </div>
      <Button variant="light" asChild className="hero-button max-md:min-h-12">
        <a
          href={movie.exploreUrl}
          aria-label={`Explore ${movie.title} on ${movie.destinationLabel ?? 'Blender Studio'}`}
        >
          Explore Film <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </Button>
    </div>
  );
}
