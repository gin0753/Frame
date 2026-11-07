import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MoviePagination } from './movie-pagination';
import { parseSearchParams, searchPageUrl } from '../data/search-params';
import { discoverPageUrl, parseDiscoverParams } from '../data/discover-params';

afterEach(cleanup);
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
      nextUrl="/search?q=a&page=2"
    />,
  );
  expect(
    screen.getByRole('navigation', { name: 'Movie result pages' }),
  ).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
    'href',
    '/search?q=a&page=2',
  );
  rerender(
    <MoviePagination
      currentPage={3}
      totalPages={3}
      previousUrl="/search?q=a&page=2"
    />,
  );
  expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  expect(screen.getByText('Page 3 of 3')).toBeVisible();
  rerender(<MoviePagination currentPage={1} totalPages={0} />);
  expect(screen.queryByRole('navigation')).toBeNull();
});
