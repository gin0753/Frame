import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Footer } from './footer';

it('preserves Blender credits and exposes the TMDB notice outside the collapsed disclosure', () => {
  const { container } = render(<Footer />);
  expect(screen.getByText(/Imagery © Blender Foundation/)).toBeVisible();
  const notice = screen.getByText(
    /This product uses the TMDB API but is not endorsed or certified by TMDB/,
  );
  expect(notice).toBeVisible();
  expect(notice.closest('details')).toBeNull();
  expect(screen.getByRole('link', { name: 'TMDB' })).toHaveAttribute(
    'href',
    'https://www.themoviedb.org',
  );
  expect(
    container.querySelector(
      '[aria-label="TMDB credits"] img, [aria-label="TMDB credits"] svg',
    ),
  ).toBeNull();
});
