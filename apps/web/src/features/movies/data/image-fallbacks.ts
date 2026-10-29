import type { MovieImage } from '../model';

/** FRAME-owned neutral artwork; never substitute another film's imagery. */
export const movieImageFallbacks = {
  poster: {
    src: '/images/fallbacks/poster.svg',
    width: 500,
    height: 750,
  },
  backdrop: {
    src: '/images/fallbacks/backdrop.svg',
    width: 1280,
    height: 720,
  },
} as const satisfies { poster: MovieImage; backdrop: MovieImage };
