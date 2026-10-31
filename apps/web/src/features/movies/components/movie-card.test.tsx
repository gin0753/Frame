import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MovieCard } from './movie-card';
import { Hero } from './hero';
import { movieFixtures } from '../data/fixtures';
it('renders a live destination without empty metadata or fixture recognition', () => {
  const movie = {
    ...movieFixtures[0],
    id: 'tmdb:42',
    title: 'Live movie',
    year: null,
    genres: [],
    synopsis: '',
    runtimeSeconds: null,
    exploreUrl: 'https://www.themoviedb.org/movie/42',
    destinationLabel: 'TMDB' as const,
  };
  const { container } = render(
    <>
      <Hero movie={movie} />
      <MovieCard movie={movie} recognition />
    </>,
  );
  expect(
    screen.getAllByRole('link', { name: 'Explore Live movie on TMDB' }),
  ).toHaveLength(2);
  expect(container.querySelector('.hero-metadata')?.children).toHaveLength(0);
  expect(container.querySelector('.movie-genres')).toBeNull();
  expect(container.querySelector('.recognition-link')).toBeNull();
});
it.each([movieFixtures[0], movieFixtures[4]])(
  'preserves the real $title title and official destination in the hero',
  (movie) => {
    render(<Hero movie={movie} />);
    expect(
      screen.getByRole('heading', { level: 1, name: movie.title }),
    ).toHaveTextContent(movie.title);
    expect(screen.getByText(movie.synopsis)).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: `Explore ${movie.title} on Blender Studio`,
      }),
    ).toHaveAttribute('href', movie.exploreUrl);
    expect(screen.queryByText('A little escape.')).not.toBeInTheDocument();
  },
);
it.each(['landscape', 'poster'] as const)(
  'renders a %s card with a real official destination and local optimized image',
  (variant) => {
    const { container } = render(
      <MovieCard movie={movieFixtures[0]} variant={variant} />,
    );
    expect(
      screen.getByRole('link', { name: 'Explore Charge on Blender Studio' }),
    ).toHaveAttribute('href', 'https://studio.blender.org/films/charge/');
    expect(screen.getByRole('heading', { name: 'Charge' })).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      `charge-${variant === 'poster' ? 'poster' : 'backdrop'}`,
    );
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
  },
);
it('displays verified recognition as its own source link, without fake scores', () => {
  render(<MovieCard movie={movieFixtures[4]} recognition />);
  expect(
    screen.getByRole('link', { name: 'SIGGRAPH 2016 · Jury Award' }),
  ).toHaveAttribute(
    'href',
    'https://www.blender.org/media-exposure/siggraph-2016-report/',
  );
});
it('omits unknown hero runtime and does not invent a trailer action', () => {
  render(<Hero movie={{ ...movieFixtures[0], runtimeSeconds: null }} />);
  expect(
    screen.getByRole('heading', { level: 1, name: 'Charge' }),
  ).toBeVisible();
  expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /trailer/i }),
  ).not.toBeInTheDocument();
});
