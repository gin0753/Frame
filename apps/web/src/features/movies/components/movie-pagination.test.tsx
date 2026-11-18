import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MoviePagination } from './movie-pagination';
import { parseSearchParams, searchPageUrl } from '../data/search-params';
import { discoverPageUrl, parseDiscoverParams } from '../data/discover-params';
import { paginationItems } from '../data/pagination';

afterEach(cleanup);
it.each([
  [1, 500, [1, 2, 3, 'ellipsis', 500]],
  [2, 500, [1, 2, 3, 4, 'ellipsis', 500]],
  [3, 500, [1, 2, 3, 4, 5, 'ellipsis', 500]],
  [8, 500, [1, 'ellipsis', 6, 7, 8, 9, 10, 'ellipsis', 500]],
  [250, 500, [1, 'ellipsis', 248, 249, 250, 251, 252, 'ellipsis', 500]],
  [499, 500, [1, 'ellipsis', 497, 498, 499, 500]],
  [500, 500, [1, 'ellipsis', 498, 499, 500]],
  [3, 6, [1, 2, 3, 4, 5, 6]],
  [4, 8, [1, 2, 3, 4, 5, 6, 7, 8]],
  [1, 1, []],
  [1, 0, []],
  [4, 3, []],
] as const)('generates page window %i/%i', (current, total, expected) => {
  expect(paginationItems(current, total)).toEqual(expected);
});
it('keeps windows bounded, unique and inside the supplied totals', () => {
  for (let current = 1; current <= 500; current++) {
    for (const radius of [1, 2]) {
      const items = paginationItems(current, 500, radius);
      const pages = items.filter((item) => typeof item === 'number');
      expect(items.length).toBeLessThanOrEqual(9);
      expect(new Set(pages).size).toBe(pages.length);
      expect(pages.every((page) => page >= 1 && page <= 500)).toBe(true);
    }
  }
  expect(paginationItems(8, 500, 1)).toEqual([
    1,
    'ellipsis',
    7,
    8,
    9,
    'ellipsis',
    500,
  ]);
});
it.each([
  [
    'search',
    (page: number) => searchPageUrl('Amélie & 東京 +', page),
    { q: 'Amélie & 東京 +', page: '8' },
  ],
  [
    'discover',
    (page: number) =>
      discoverPageUrl(
        {
          genreId: '18',
          yearFrom: '1990',
          yearTo: '1999',
          sort: 'rated',
          page: '8',
        },
        page,
      ),
    {
      genreId: '18',
      yearFrom: '1990',
      yearTo: '1999',
      sort: 'rated',
      page: '8',
    },
  ],
  [
    'discover',
    (page: number) =>
      discoverPageUrl(
        { genreId: '', yearFrom: '', yearTo: '', sort: 'popular', page: '8' },
        page,
      ),
    { page: '8' },
  ],
] as const)(
  'builds a separate %s GET jump form from applied state',
  (route, pageUrl, fields) => {
    const { container } = render(
      <MoviePagination currentPage={8} totalPages={500} pageUrl={pageUrl} />,
    );
    const form = screen.getByRole('form', {
      name: 'Jump to page',
    }) as HTMLFormElement;
    expect(form).toHaveAttribute('action', '/' + route);
    expect(form).toHaveAttribute('method', 'get');
    expect(form.parentElement?.closest('form')).toBeNull();
    expect(Object.fromEntries(new FormData(form))).toEqual(fields);
    expect(new FormData(form).getAll('page')).toEqual(['8']);
    const input = screen.getByRole('spinbutton', { name: 'Page' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '500');
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveAccessibleDescription(
      'Enter a whole page from 1 to 500.',
    );
    expect(screen.getByText('of 500')).toBeVisible();
    expect(screen.queryByText('Whole page, 1–500.')).toBeNull();
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(2);
    expect(
      container.querySelector('[aria-current="page"]'),
    ).toHaveAccessibleName('Current page, 8');
    for (const link of screen.getAllByRole('link', {
      name: 'Page 7',
    }))
      expect(link).toHaveAttribute('href', pageUrl(7));
    for (const link of screen.getAllByRole('link', {
      name: 'Page 1',
    }))
      expect(link.getAttribute('href')).not.toContain('page=1');
  },
);
it('builds deterministic encoded links from applied state and omits defaults', () => {
  expect(parseSearchParams({ q: ' Alien ', page: '2' })).toEqual({
    status: 'valid',
    q: 'Alien',
    page: '2',
  });
  expect(parseSearchParams({ page: '2' }).status).toBe('invalid');
  const url = new URL(
    searchPageUrl('Amélie & 東京  +', 2),
    'https://frame.test',
  );
  expect(url.searchParams.get('q')).toBe('Amélie & 東京  +');
  expect(url.searchParams.get('page')).toBe('2');
  expect(searchPageUrl('Alien')).toBe('/search?q=Alien');
  const query = parseDiscoverParams({
    genreId: '18',
    yearFrom: '1990',
    sort: 'rated',
    page: '2',
  }).query!;
  expect(discoverPageUrl(query, 3)).toBe(
    '/discover?genreId=18&yearFrom=1990&sort=rated&page=3',
  );
  expect(discoverPageUrl({ sort: 'popular', page: '2' })).toBe('/discover');
});
it('uses native accessible links and truthful boundaries', () => {
  const { rerender } = render(
    <MoviePagination
      currentPage={1}
      totalPages={3}
      pageUrl={(page) => searchPageUrl('a', page)}
    />,
  );
  expect(
    screen.getByRole('navigation', { name: 'Movie result pages' }),
  ).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  expect(screen.queryByText('Previous')).toBeNull();
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
    'href',
    '/search?q=a&page=2',
  );
  rerender(
    <MoviePagination
      currentPage={3}
      totalPages={3}
      pageUrl={(page) => searchPageUrl('a', page)}
    />,
  );
  expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  expect(screen.queryByText('Next')).toBeNull();
  expect(screen.getByText('Page 3 of 3')).toBeVisible();
  rerender(
    <MoviePagination
      currentPage={2}
      totalPages={3}
      pageUrl={(page) => searchPageUrl('a', page)}
    />,
  );
  expect(screen.getByRole('link', { name: 'Previous' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Next' })).toBeVisible();
  rerender(
    <MoviePagination
      currentPage={1}
      totalPages={0}
      pageUrl={(page) => searchPageUrl('a', page)}
    />,
  );
  expect(screen.queryByRole('navigation')).toBeNull();
  rerender(
    <MoviePagination
      currentPage={1}
      totalPages={1}
      pageUrl={(page) => searchPageUrl('a', page)}
    />,
  );
  expect(screen.queryByRole('navigation')).toBeNull();
});
