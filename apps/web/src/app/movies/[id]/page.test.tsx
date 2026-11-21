import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('./detail-data', () => ({ readDetail: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
import Page, { generateMetadata } from './page';
import { readDetail } from './detail-data';

const movie = {
  id: 42,
  source: 'tmdb' as const,
  title: 'A Film',
  originalTitle: 'Original',
  releaseDate: '2020-01-01',
  posterUrl: null,
  backdropUrl: null,
  genreIds: [],
  genres: [],
  voteAverage: 0,
  voteCount: 0,
  overview: null,
  externalUrl: 'https://www.themoviedb.org/movie/42',
  attribution: {
    provider: 'tmdb' as const,
    sourceUrl: 'https://www.themoviedb.org/movie/42',
  },
  runtimeMinutes: null,
  directors: [],
  cast: [{ id: 1, name: 'Actor', character: null, profileUrl: null }],
  countries: [],
  languages: [],
  budgetUsd: null,
  revenueUsd: null,
  trailerUrl: null,
  externalLinks: [],
};
const props = { params: Promise.resolve({ id: '42' }) };
beforeEach(() => vi.resetAllMocks());
it('renders truthful details, compact cast and real rail destinations', async () => {
  vi.mocked(readDetail).mockResolvedValue({ status: 'success', movie });
  render(await Page(props));
  expect(
    screen.getByRole('heading', { name: 'A Film', level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getAllByText('Original').length).toBeGreaterThan(0);
  expect(screen.getByText('Actor')).toBeInTheDocument();
  expect(screen.getByText(/overview is not available/i)).toBeInTheDocument();
  expect(screen.getByText('No TMDB rating available')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /trailer/i })).toBeNull();
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(screen.getByRole('button', { name: /watchlist/i })).toBeDisabled();
  expect(await generateMetadata(props)).toMatchObject({
    title: 'A Film — FRAME',
  });
});
it.each(['busy', 'unavailable'] as const)(
  'renders %s with retry and noindex',
  async (status) => {
    vi.mocked(readDetail).mockResolvedValue({ status });
    render(await Page(props));
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(await generateMetadata(props)).toMatchObject({
      robots: { index: false },
    });
  },
);
it('uses not-found for missing detail', async () => {
  vi.mocked(readDetail).mockResolvedValue({ status: 'missing' });
  await expect(Page(props)).rejects.toThrow('NOT_FOUND');
});
