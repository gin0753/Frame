import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MoviePreview } from '../model';
import { formatRuntime } from '../presentation';
export function Hero({ movie }: { movie: MoviePreview }) {
  const runtime = formatRuntime(movie.runtimeSeconds);
  return (
    <section
      id="discover"
      className="cinema-hero"
      aria-labelledby="featured-title"
    >
      <div className="hero-image">
        <Image
          src={movie.backdrop.src}
          alt=""
          fill
          preload
          sizes="100vw"
          className="hero-backdrop"
        />
      </div>
      <div className="hero-shade" />
      <div className="hero-content container-shell">
        <p className="eyebrow hero-kicker">Featured film</p>
        <h1 id="featured-title">{movie.title}</h1>
        <p className="hero-overview">{movie.synopsis}</p>
        <div className="hero-metadata">
          <span>{movie.year}</span>
          <span>{movie.genres.join(' / ')}</span>
          {runtime && <span>{runtime}</span>}
        </div>
        <Button variant="light" asChild className="hero-button max-md:min-h-12">
          <a
            href={movie.exploreUrl}
            aria-label={`Explore ${movie.title} on Blender Studio`}
          >
            Explore Film <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
