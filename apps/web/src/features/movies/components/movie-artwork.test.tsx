import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { movieSummarySchema } from '@frame/contracts';
import { MovieArtwork } from './movie-artwork';
import { MovieCard } from './movie-card';
import { Hero } from './hero';
import { movieFixtures } from '../data/fixtures';
import { toMoviePreview } from '../data/catalog-adapter';
import { movieImageFallbacks } from '../data/image-fallbacks';

it('replaces a failed image without retry and attempts a changed source once', () => {
  const artwork = movieFixtures[0].poster;
  const { container, rerender } = render(
    <MovieArtwork artwork={artwork} sizes="50vw" />,
  );
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('Image unavailable')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByText('Image unavailable')).toHaveAttribute(
    'data-image-unavailable',
  );
  rerender(<MovieArtwork artwork={artwork} sizes="50vw" />);
  expect(container.querySelector('img')).toBeNull();
  rerender(<MovieArtwork artwork={movieFixtures[1].poster} sizes="50vw" />);
  expect(container.querySelector('img')).not.toBeNull();
});

it('does not request an empty image source', () => {
  const { container } = render(
    <MovieArtwork
      artwork={{ src: '', width: 500, height: 750 }}
      sizes="50vw"
    />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('Image unavailable')).toBeVisible();
});

it('serves TMDB artwork directly without the retaining Next optimizer', () => {
  const src = 'https://image.tmdb.org/t/p/w500/synthetic.jpg';
  const { container } = render(
    <MovieArtwork artwork={{ src, width: 500, height: 750 }} sizes="50vw" />,
  );
  expect(container.querySelector('img')).toHaveAttribute('src', src);
  expect(container.querySelector('img')).not.toHaveAttribute('srcset');
});

it.each(movieFixtures)(
  'preserves $title in Hero and both card variants',
  (movie) => {
    const { container } = render(
      <>
        <Hero movie={movie} />
        <MovieCard movie={movie} />
        <MovieCard movie={movie} variant="poster" recognition />
      </>,
    );
    expect(
      screen.getAllByRole('link', {
        name: `Explore ${movie.title} on Blender Studio`,
      }),
    ).toHaveLength(3);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(
      container.querySelector('.hero-backdrop')?.getAttribute('style'),
    ).not.toContain('object-position');
  },
);

it.each(['poster', 'backdrop', 'both'] as const)(
  'keeps long-title TMDB links usable with missing %s and after image failure',
  (missing) => {
    const title = 'A very long synthetic film title '.repeat(8).trim();
    const summary = movieSummarySchema.parse({
      id: 42,
      source: 'tmdb',
      title,
      releaseDate: null,
      posterUrl:
        missing === 'backdrop'
          ? 'https://image.tmdb.org/t/p/w500/synthetic.jpg'
          : null,
      backdropUrl:
        missing === 'poster'
          ? 'https://image.tmdb.org/t/p/w1280/synthetic.jpg'
          : null,
      genreIds: [],
      voteAverage: null,
      voteCount: 0,
      overview: null,
      externalUrl: 'https://www.themoviedb.org/movie/42',
      attribution: {
        provider: 'tmdb',
        sourceUrl: 'https://www.themoviedb.org/movie/42',
      },
    });
    const { movie } = toMoviePreview(summary, [], movieImageFallbacks);
    const { container } = render(
      <>
        <Hero movie={movie} />
        <MovieCard movie={movie} />
        <MovieCard movie={movie} variant="poster" />
      </>,
    );
    for (const image of container.querySelectorAll('img'))
      fireEvent.error(image);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    for (const link of screen.getAllByRole('link', {
      name: `Explore ${title} on TMDB`,
    }))
      expect(link).toHaveAttribute('href', summary.externalUrl);
    expect(container.querySelectorAll('.movie-image')).toHaveLength(2);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  },
);
