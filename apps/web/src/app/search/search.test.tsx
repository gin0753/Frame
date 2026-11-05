import { render, screen } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { parseSearchParams } from '@/features/movies/data/search-params';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/catalog', async (original) => ({
  ...(await original<typeof import('@/lib/server/catalog')>()),
  searchMovies: vi.fn(),
  getCatalogGenres: vi.fn(),
}));
import {
  CatalogReadError,
  searchMovies,
  getCatalogGenres,
} from '@/lib/server/catalog';
import SearchPage, { metadata } from './page';
import { SearchResults } from './search-results';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCatalogGenres).mockResolvedValue({ items: [] });
});
const page = {
  page: 1,
  pageSize: 20 as const,
  totalPages: 0,
  totalResults: 0,
  items: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

const populatedPage: Awaited<ReturnType<typeof searchMovies>> = {
  ...page,
  totalPages: 1,
  totalResults: 1,
  items: [
    {
      id: 42,
      source: 'tmdb',
      title: 'Alien',
      releaseDate: '1979-05-25',
      posterUrl: null,
      backdropUrl: null,
      genreIds: [18],
      voteAverage: null,
      voteCount: 0,
      overview: null,
      externalUrl: 'https://www.themoviedb.org/movie/42',
      attribution: {
        provider: 'tmdb',
        sourceUrl: 'https://www.themoviedb.org/movie/42',
      },
    },
  ],
};

it.each([503, 429, 'empty'] as const)(
  'renders Search %s before pending Genres and handles its later rejection',
  async (outcome) => {
    const search = deferred<Awaited<ReturnType<typeof searchMovies>>>();
    const genres = deferred<Awaited<ReturnType<typeof getCatalogGenres>>>();
    vi.mocked(searchMovies).mockReturnValue(search.promise);
    vi.mocked(getCatalogGenres).mockReturnValue(genres.promise);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = SearchResults({ q: 'Alien' });
      expect(searchMovies).toHaveBeenCalledExactlyOnceWith('Alien');
      expect(getCatalogGenres).toHaveBeenCalledTimes(1);
      if (outcome === 'empty') search.resolve(page);
      else search.reject(new CatalogReadError(outcome));

      // Genres is deliberately unresolved here: the old coupled flow would hang.
      render(await result);
      expect(
        screen.getByText(
          outcome === 'empty'
            ? 'No films found for “Alien”.'
            : outcome === 429
              ? 'Search is temporarily busy'
              : 'Film search is temporarily unavailable',
        ),
      ).toBeVisible();

      genres.reject(new Error('Late dictionary failure'));
      // Drain the rejection notification turn, without a time-based sleep.
      await setImmediate();
      expect(unhandled).not.toHaveBeenCalled();
      expect(searchMovies).toHaveBeenCalledTimes(1);
      expect(getCatalogGenres).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  },
);

it('retains available genre labels with one concurrent request per resource', async () => {
  const search = deferred<Awaited<ReturnType<typeof searchMovies>>>();
  const genres = deferred<Awaited<ReturnType<typeof getCatalogGenres>>>();
  vi.mocked(searchMovies).mockReturnValue(search.promise);
  vi.mocked(getCatalogGenres).mockReturnValue(genres.promise);
  const result = SearchResults({ q: 'Alien' });
  expect(searchMovies).toHaveBeenCalledTimes(1);
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
  search.resolve(populatedPage);
  genres.resolve({ items: [{ id: 18, name: 'Drama' }] });
  render(await result);
  expect(screen.getByText('Drama')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Explore Alien 1979 Drama on TMDB' }),
  ).toHaveAttribute('href', 'https://www.themoviedb.org/movie/42');
  expect(searchMovies).toHaveBeenCalledTimes(1);
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
});

it('handles an early Genres rejection while Search is pending and retains the movies', async () => {
  const search = deferred<Awaited<ReturnType<typeof searchMovies>>>();
  const genres = deferred<Awaited<ReturnType<typeof getCatalogGenres>>>();
  vi.mocked(searchMovies).mockReturnValue(search.promise);
  vi.mocked(getCatalogGenres).mockReturnValue(genres.promise);
  const result = SearchResults({ q: 'Alien' });
  genres.reject(new Error('Dictionary failure'));
  await setImmediate();
  search.resolve(populatedPage);
  render(await result);
  expect(
    screen.getByRole('link', { name: 'Explore Alien 1979 on TMDB' }),
  ).toBeVisible();
  expect(screen.queryByText('Drama')).not.toBeInTheDocument();
  expect(searchMovies).toHaveBeenCalledTimes(1);
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
});

it('does not await Genres for movies without genre identities', async () => {
  const genres = deferred<Awaited<ReturnType<typeof getCatalogGenres>>>();
  vi.mocked(getCatalogGenres).mockReturnValue(genres.promise);
  vi.mocked(searchMovies).mockResolvedValue({
    ...populatedPage,
    items: populatedPage.items.map((movie) => ({ ...movie, genreIds: [] })),
  });
  render(await SearchResults({ q: 'Alien' }));
  expect(
    screen.getByRole('link', { name: 'Explore Alien 1979 on TMDB' }),
  ).toBeVisible();
  genres.reject(new Error('Unused dictionary failure'));
  await setImmediate();
  expect(searchMovies).toHaveBeenCalledTimes(1);
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
});

it('validates URL state without ignoring duplicates, unsupported keys or pages', () => {
  expect(parseSearchParams({}).status).toBe('initial');
  expect(parseSearchParams({ q: ' \t ' }).status).toBe('initial');
  expect(parseSearchParams({ q: ' Amélie  東京 ' })).toEqual({
    status: 'valid',
    q: 'Amélie  東京',
  });
  for (const input of [
    { q: ['a', 'b'] },
    { page: '2' },
    { q: 'a', genreId: '18' },
    { q: 'a'.repeat(201) },
  ])
    expect(parseSearchParams(input).status).toBe('invalid');
});
it('renders an initial native accessible GET form without catalog requests and noindex metadata', async () => {
  render(await SearchPage({ searchParams: Promise.resolve({}) }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Search films' }),
  ).toBeVisible();
  const form = screen.getByRole('search', { name: 'Film search' });
  expect(form).toHaveAttribute('action', '/search');
  expect(form).toHaveAttribute('method', 'get');
  expect(screen.getByRole('searchbox', { name: 'Film title' })).toHaveAttribute(
    'name',
    'q',
  );
  expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
    'type',
    'submit',
  );
  expect(screen.getByText('Enter a title to begin.')).toBeVisible();
  expect(searchMovies).not.toHaveBeenCalled();
  expect(metadata.robots).toEqual({ index: false, follow: true });
});
it('associates invalid query feedback and avoids provider work', async () => {
  render(
    await SearchPage({ searchParams: Promise.resolve({ q: 'a', page: '2' }) }),
  );
  expect(screen.getByRole('searchbox')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('searchbox')).toHaveAccessibleDescription(
    /Use one film title/,
  );
  expect(searchMovies).not.toHaveBeenCalled();
});
it('renders truthful empty results', async () => {
  vi.mocked(searchMovies).mockResolvedValue(page);
  render(await SearchResults({ q: 'Alien' }));
  expect(screen.getByText('No films found for “Alien”.')).toBeVisible();
});
it.each([429, 503])(
  'renders safe error %s with native same-query retry',
  async (status) => {
    vi.mocked(searchMovies).mockRejectedValue(new CatalogReadError(status));
    render(await SearchResults({ q: 'Amélie & 東京' }));
    expect(
      screen.getByRole('heading', {
        name:
          status === 429
            ? 'Search is temporarily busy'
            : 'Film search is temporarily unavailable',
      }),
    ).toBeVisible();
    const form = screen
      .getByRole('button', { name: 'Try again' })
      .closest('form');
    expect(form).toHaveAttribute('method', 'get');
    expect(form?.querySelector('input')).toHaveValue('Amélie & 東京');
  },
);
it('preserves metadata/destination and first-page wording when the dictionary fails', async () => {
  vi.mocked(getCatalogGenres).mockRejectedValue(new Error('unavailable'));
  vi.mocked(searchMovies).mockResolvedValue({
    ...page,
    totalPages: 2,
    totalResults: 21,
    items: [
      {
        id: 42,
        source: 'tmdb',
        title: 'Long title',
        releaseDate: null,
        posterUrl: null,
        backdropUrl: null,
        genreIds: [18],
        voteAverage: null,
        voteCount: 0,
        overview: null,
        externalUrl: 'https://www.themoviedb.org/movie/42',
        attribution: {
          provider: 'tmdb',
          sourceUrl: 'https://www.themoviedb.org/movie/42',
        },
      },
    ],
  });
  render(await SearchResults({ q: 'Long' }));
  expect(
    screen.getByRole('link', { name: 'Explore Long title on TMDB' }),
  ).toHaveAttribute('href', 'https://www.themoviedb.org/movie/42');
  expect(screen.getByText('Showing 1 film.')).toBeVisible();
  expect(
    screen.getByText('Only the first page is available in this release.'),
  ).toBeVisible();
});
