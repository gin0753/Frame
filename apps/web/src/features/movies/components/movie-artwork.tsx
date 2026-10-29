'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { MovieImage } from '../model';
import { movieImageFallbacks } from '../data/image-fallbacks';

type ArtworkProps = {
  artwork: MovieImage;
  sizes: string;
  preload?: boolean;
  className?: string;
  objectPosition?: string;
};

/** A new source gets one attempt; failures never retry or change container geometry. */
export function MovieArtwork(props: ArtworkProps) {
  return <ArtworkAttempt key={props.artwork.src} {...props} />;
}

function ArtworkAttempt({
  artwork,
  sizes,
  preload,
  className,
  objectPosition,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !artwork.src.trim())
    return (
      <span
        data-image-unavailable
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center bg-surface px-4 text-center text-xs text-muted-foreground"
        style={{ background: 'linear-gradient(135deg, #1c1e22, #101113)' }}
      >
        Image unavailable
      </span>
    );
  return (
    <Image
      src={artwork.src}
      alt=""
      fill
      preload={preload}
      draggable={false}
      sizes={sizes}
      className={className}
      data-image-unavailable={
        artwork.src === movieImageFallbacks.poster.src ||
        artwork.src === movieImageFallbacks.backdrop.src ||
        undefined
      }
      // Provider retention rights are unresolved: never send TMDB artwork through
      // Next's disk-backed image optimizer. Local licensed fixtures stay optimized.
      unoptimized={artwork.src.startsWith('https://image.tmdb.org/t/p/')}
      style={{ objectFit: 'cover', objectPosition }}
      onError={() => setFailed(true)}
    />
  );
}
