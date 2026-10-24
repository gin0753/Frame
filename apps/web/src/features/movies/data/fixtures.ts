import type { MovieSource } from './movie-source';
import type { MoviePreview } from '../model';

/** Curated licensed open films. Order is editorial, never a live popularity metric. */
export const movieFixtures = [
  {
    id: 'charge',
    title: 'Charge',
    year: 2022,
    genres: ['Science fiction', 'Action'],
    runtimeSeconds: 263,
    synopsis:
      'In a world running out of power, one man risks everything inside a heavily guarded battery factory.',
    backdrop: {
      src: '/images/films/charge-backdrop.webp',
      width: 1920,
      height: 850,
      position: '70% center',
    },
    poster: {
      src: '/images/films/charge-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/charge/',
  },
  {
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    genres: ['Fantasy', 'Adventure'],
    runtimeSeconds: null,
    synopsis:
      'A young traveller crosses an unforgiving world in search of a dragon she once rescued.',
    backdrop: {
      src: '/images/films/sintel-backdrop.webp',
      width: 1920,
      height: 818,
      position: '66% center',
    },
    poster: {
      src: '/images/films/sintel-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/sintel/',
    recognition: {
      label: 'Festival selection',
      sourceUrl: 'https://durian.blender.org/press-and-events/',
    },
  },
  {
    id: 'spring',
    title: 'Spring',
    year: 2019,
    genres: ['Fantasy', 'Adventure'],
    runtimeSeconds: 464,
    synopsis:
      'A shepherd girl and her dog venture into a world of ancient spirits to wake the forest from winter.',
    backdrop: {
      src: '/images/films/spring-backdrop.webp',
      width: 1920,
      height: 650,
      position: '65% center',
    },
    poster: {
      src: '/images/films/spring-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/spring/',
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    year: 2012,
    genres: ['Science fiction', 'Action'],
    runtimeSeconds: null,
    synopsis:
      'In a future Amsterdam, a small team confronts the memories behind a robotic threat.',
    backdrop: {
      src: '/images/films/tears-of-steel-backdrop.webp',
      width: 1920,
      height: 650,
      position: '65% center',
    },
    poster: {
      src: '/images/films/tears-of-steel-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/tears-of-steel/',
  },
  {
    id: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    year: 2015,
    genres: ['Fantasy', 'Comedy'],
    runtimeSeconds: null,
    synopsis:
      'A chance encounter on a lonely island offers a sheep an extraordinary change of perspective.',
    backdrop: {
      src: '/images/films/cosmos-laundromat-backdrop.webp',
      width: 1592,
      height: 1040,
      position: '60% center',
    },
    poster: {
      src: '/images/films/cosmos-laundromat-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/cosmos-laundromat/',
    recognition: {
      label: 'SIGGRAPH 2016 · Jury Award',
      sourceUrl: 'https://www.blender.org/media-exposure/siggraph-2016-report/',
    },
  },
  {
    id: 'sprite-fright',
    title: 'Sprite Fright',
    year: 2021,
    genres: ['Horror', 'Comedy'],
    runtimeSeconds: null,
    synopsis:
      'A forest outing takes a darkly comic turn when its smallest inhabitants decide to fight back.',
    backdrop: {
      src: '/images/films/sprite-fright-backdrop.webp',
      width: 1920,
      height: 850,
      position: '60% center',
    },
    poster: {
      src: '/images/films/sprite-fright-poster.webp',
      width: 600,
      height: 900,
    },
    exploreUrl: 'https://studio.blender.org/films/sprite-fright/',
    recognition: {
      label: 'Annecy 2022 · Official selection',
      sourceUrl:
        'https://see-nl.com/artikel/20220613-annecy-2022-sprite-fright',
    },
  },
] as const satisfies readonly MoviePreview[];
export const fixtureMovieSource: MovieSource = {
  async listPreviews() {
    return movieFixtures;
  },
};
