import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  cloneElement,
  isValidElement,
  Suspense,
  type ReactNode,
  type ReactElement,
} from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { parseDiscoverParams } from '@/features/movies/data/discover-params';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/catalog', async (original) => ({
  ...(await original<typeof import('@/lib/server/catalog')>()),
  discoverMovies: vi.fn(),
  getCatalogGenres: vi.fn(),
}));
import {
  discoverMovies,
  getCatalogGenres,
  CatalogReadError,
} from '@/lib/server/catalog';
import DiscoverPage from './page';
import { DiscoverResults } from './discover-results';

it('retains the complete later-page tuple in Retry and page-one recovery', async () => {
  const query = {
    genreId: '18',
    yearFrom: '1990',
    sort: 'rated' as const,
    page: '4',
  };
  vi.mocked(discoverMovies).mockRejectedValueOnce(new CatalogReadError(429));
  const failure = render(
    await DiscoverResults({ query, dictionary: { current: null } }),
  );
  expect(failure.container.querySelector('input[name="page"]')).toHaveValue(
    '4',
  );
  expect(failure.container.querySelector('input[name="genreId"]')).toHaveValue(
    '18',
  );
  failure.unmount();
  vi.mocked(discoverMovies).mockResolvedValueOnce({
    page: 4,
    pageSize: 20,
    totalPages: 3,
    totalResults: 60,
    items: [],
  });
  render(await DiscoverResults({ query, dictionary: { current: null } }));
  expect(
    screen.getByRole('link', { name: 'Return to page 1' }),
  ).toHaveAttribute('href', '/discover?genreId=18&yearFrom=1990&sort=rated');
});
const empty = {
  page: 1,
  pageSize: 20 as const,
  totalPages: 0,
  totalResults: 0,
  items: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCatalogGenres).mockResolvedValue({
    items: [{ id: 18, name: 'Drama' }],
  });
  vi.mocked(discoverMovies).mockResolvedValue(empty);
});
// Resolve only async server components; native/client components retain normal React rendering.
async function resolveServer(
  node: ReactNode,
  showFallbacks = false,
): Promise<ReactNode> {
  if (Array.isArray(node))
    return Promise.all(
      node.map((child) => resolveServer(child, showFallbacks)),
    );
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{
    children?: ReactNode;
    fallback?: ReactNode;
  }>;
  // Inspect the actual server fallback markup without awaiting its pending children.
  // This models the shell and resolved representations, not browser streaming transport.
  if (showFallbacks && el.type === Suspense)
    return resolveServer(el.props.fallback, true);
  if (
    typeof el.type === 'function' &&
    el.type.constructor.name === 'AsyncFunction'
  )
    return resolveServer(
      await (el.type as (props: unknown) => Promise<ReactNode>)(el.props),
    );
  return el.props.children === undefined
    ? el
    : cloneElement(
        el,
        {},
        await resolveServer(el.props.children, showFallbacks),
      );
}
async function page(params: Record<string, string | string[]> = {}) {
  render(
    await resolveServer(
      await DiscoverPage({ searchParams: Promise.resolve(params) }),
    ),
  );
}
it('rejects invalid tuples, duplicates and unknowns while preserving sibling fields', () => {
  for (const p of [
    { yearFrom: '2000', yearTo: '1999', genreId: '18' },
    { genreId: ['18', '28'] },
    { sort: 'bad' },
    { unknown: 'x' },
    { page: '501' },
  ])
    expect(parseDiscoverParams(p).query).toBeNull();
  expect(
    parseDiscoverParams({ yearFrom: 'bad', yearTo: '1999', sort: 'rated' })
      .fields,
  ).toMatchObject({ yearFrom: 'bad', yearTo: '1999', sort: 'rated' });
  expect(
    parseDiscoverParams({ yearFrom: 'bad', yearTo: '1999' }).errors,
  ).not.toHaveProperty('yearTo');
  expect(
    parseDiscoverParams({ genreId: '', yearFrom: '', yearTo: '' }).query,
  ).toMatchObject({ sort: 'popular', page: '1' });
});
it('default discovery fetches results, renders native GET controls and route-aware navigation', async () => {
  await page();
  expect(discoverMovies).toHaveBeenCalledTimes(1);
  expect(discoverMovies).toHaveBeenCalledWith({ sort: 'popular', page: '1' });
  const form = screen.getByRole('form', { name: 'Discover filters' });
  expect(form).toHaveAttribute('action', '/discover');
  expect(form).toHaveAttribute('method', 'get');
  expect(screen.getByLabelText('Genre')).toHaveValue('');
  expect(screen.getByLabelText('Sort')).toHaveValue('popular');
  expect(screen.getByRole('group', { name: 'Release year' })).toBeVisible();
  expect(within(form).getByRole('link', { name: 'Reset' })).toHaveAttribute(
    'href',
    '/discover',
  );
  expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
it('preserves applied values and edits do not change results or fetch until submission', async () => {
  await page({
    genreId: '18',
    yearFrom: '1990',
    yearTo: '1999',
    sort: 'rated',
  });
  expect(screen.getByLabelText('Genre')).toHaveValue('18');
  expect(screen.getByLabelText('From year')).toHaveValue('1990');
  expect(screen.getByLabelText('To year')).toHaveValue('1999');
  expect(screen.getByLabelText('Sort')).toHaveValue('rated');
  const summary = screen.getByText(
    'Drama · 1990–1999 · Highest TMDB Rated · 100+ votes',
  );
  expect(summary).toBeVisible();
  await userEvent
    .setup()
    .selectOptions(screen.getByLabelText('Sort'), 'newest');
  expect(summary).toBeVisible();
  expect(discoverMovies).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      'Newest includes upcoming films. Highest rated includes films with at least 100 TMDB votes.',
    ),
  ).toBeVisible();
});
it('invalid years render editable values, associated errors and make no discovery call', async () => {
  await page({ yearFrom: 'bad', yearTo: '1999' });
  expect(
    screen.getByRole('heading', { name: 'Check your filters' }),
  ).toBeVisible();
  expect(screen.getByLabelText('From year')).toHaveValue('bad');
  expect(screen.getByLabelText('To year')).toHaveValue('1999');
  expect(screen.getByLabelText('From year')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(discoverMovies).not.toHaveBeenCalled();
});
it.each(['', '18'])(
  'dictionary failure retains selected identity %s without blocking successful results',
  async (genreId) => {
    vi.mocked(getCatalogGenres).mockRejectedValue(new Error('offline'));
    await page({ genreId });
    expect(screen.getByLabelText('Genre')).toBeDisabled();
    expect(screen.getByText('No films match these filters.')).toBeVisible();
    if (genreId)
      expect(document.querySelector('input[name="genreId"]')).toHaveValue('18');
  },
);
it('unknown dictionary ID remains visible and is not silently reset', async () => {
  vi.mocked(discoverMovies).mockRejectedValue(new CatalogReadError(400));
  await page({ genreId: '999' });
  expect(screen.getByLabelText('Genre')).toHaveValue('999');
  expect(screen.getByLabelText('Genre')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(
    screen.getByRole('heading', { name: 'Check your filters' }),
  ).toBeVisible();
});
it.each([429, 503])(
  'safe failure %s keeps native retry tuple',
  async (status) => {
    vi.mocked(discoverMovies).mockRejectedValue(new CatalogReadError(status));
    render(
      await DiscoverResults({
        query: { sort: 'rated', page: '1', genreId: '18', yearFrom: '1990' },
        dictionary: { current: null },
      }),
    );
    const retry = screen
      .getByRole('button', { name: 'Try again' })
      .closest('form')!;
    expect(retry).toHaveAttribute('method', 'get');
    expect(new FormData(retry).get('genreId')).toBe('18');
    expect(new FormData(retry).get('sort')).toBe('rated');
  },
);
it('successful movies render immediately without an optional dictionary, omit missing metadata and show actual count', async () => {
  vi.mocked(discoverMovies).mockResolvedValue({
    ...empty,
    totalPages: 2,
    totalResults: 21,
    items: [
      {
        id: 42,
        source: 'tmdb',
        title: 'Synthetic film',
        releaseDate: null,
        genreIds: [18],
        posterUrl: null,
        backdropUrl: null,
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
  render(
    await DiscoverResults({
      query: { sort: 'newest', page: '1' },
      dictionary: { current: null },
    }),
  );
  expect(
    screen.getByRole('link', { name: 'Explore Synthetic film on TMDB' }),
  ).toBeVisible();
  expect(screen.getByText('Showing 1 film.')).toBeVisible();
  expect(screen.getByText('Page 1 of 2')).toBeVisible();
});

it('observes a late optional dictionary rejection after the page shell and empty results resolve', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(getCatalogGenres).mockReturnValue(
    new Promise((_resolve, decline) => {
      reject = decline;
    }),
  );
  const shell = await DiscoverPage({ searchParams: Promise.resolve({}) });
  expect(shell).toBeTruthy();
  render(
    await DiscoverResults({
      query: { sort: 'popular', page: '1' },
      dictionary: { current: null },
    }),
  );
  expect(screen.getByText('No films match these filters.')).toBeVisible();
  reject(new Error('late optional failure'));
  await setImmediate();
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
  expect(discoverMovies).toHaveBeenCalledTimes(1);
});

it('invalid selected options remain successful form controls until explicitly corrected', async () => {
  await page({ genreId: '999', sort: 'unsupported' });
  const form = screen.getByRole('form', {
    name: 'Discover filters',
  }) as HTMLFormElement;
  expect(new FormData(form).get('genreId')).toBe('999');
  expect(new FormData(form).get('sort')).toBe('unsupported');
  expect(discoverMovies).not.toHaveBeenCalled();
});

it.each([
  { genreId: '0', invalid: true },
  { genreId: '18', invalid: false },
])(
  'preserves pending Genre $genreId validation and one submitted value through resolution',
  async ({ genreId, invalid }) => {
    let resolve!: (value: Awaited<ReturnType<typeof getCatalogGenres>>) => void;
    vi.mocked(getCatalogGenres).mockReturnValue(
      new Promise((accept) => {
        resolve = accept;
      }),
    );
    const shell = await DiscoverPage({
      searchParams: Promise.resolve({ genreId }),
    });
    const view = render(await resolveServer(shell, true));
    const pending = screen.getByLabelText('Genre');
    expect(pending).toBeDisabled();
    expect(pending).toHaveValue(genreId);
    if (invalid) {
      expect(pending).toHaveAttribute('aria-invalid', 'true');
      expect(pending).toHaveAttribute('aria-describedby', 'genreId-error');
      const error = document.getElementById('genreId-error')!;
      expect(error).toBeVisible();
      expect(pending).toHaveAccessibleDescription(error.textContent!);
    } else {
      expect(pending).not.toHaveAttribute('aria-invalid');
      expect(pending).not.toHaveAttribute('aria-describedby');
      expect(document.getElementById('genreId-error')).toBeNull();
    }
    const values = () =>
      new FormData(
        screen.getByRole('form', {
          name: 'Discover filters',
        }) as HTMLFormElement,
      ).getAll('genreId');
    expect(values()).toEqual([genreId]);
    resolve({ items: [{ id: 18, name: 'Drama' }] });
    view.rerender(await resolveServer(shell));
    const resolved = screen.getByLabelText('Genre');
    expect(resolved).toBeEnabled();
    expect(resolved).toHaveValue(genreId);
    expect(values()).toEqual([genreId]);
    expect(
      document.querySelector('input[type="hidden"][name="genreId"]'),
    ).toBeNull();
    if (invalid) {
      expect(resolved).toHaveAttribute('aria-invalid', 'true');
      expect(resolved).toHaveAttribute('aria-describedby', 'genreId-error');
    } else {
      expect(resolved).not.toHaveAttribute('aria-invalid');
    }
    expect(getCatalogGenres).toHaveBeenCalledTimes(1);
    expect(discoverMovies).toHaveBeenCalledTimes(invalid ? 0 : 1);
  },
);

it('retains a selected Genre after a deferred dictionary rejection without broadening or duplicate values', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(getCatalogGenres).mockReturnValue(
    new Promise((_accept, decline) => {
      reject = decline;
    }),
  );
  const shell = await DiscoverPage({
    searchParams: Promise.resolve({ genreId: '18' }),
  });
  const view = render(await resolveServer(shell, true));
  expect(screen.getByLabelText('Genre')).toBeDisabled();
  reject(new Error('late optional dictionary failure'));
  await setImmediate();
  view.rerender(await resolveServer(shell));
  const genre = screen.getByLabelText('Genre');
  expect(genre).toBeDisabled();
  expect(genre).toHaveValue('18');
  expect(genre).not.toHaveAttribute('aria-invalid');
  expect(genre).toHaveAttribute('aria-describedby', 'genre-availability');
  expect(document.getElementById('genre-availability')).toBeVisible();
  expect(
    new FormData(
      screen.getByRole('form', { name: 'Discover filters' }) as HTMLFormElement,
    ).getAll('genreId'),
  ).toEqual(['18']);
  expect(screen.getByText('No films match these filters.')).toBeVisible();
  expect(getCatalogGenres).toHaveBeenCalledTimes(1);
  expect(discoverMovies).toHaveBeenCalledTimes(1);
  expect(discoverMovies).toHaveBeenCalledWith({
    genreId: '18',
    sort: 'popular',
    page: '1',
  });
});
