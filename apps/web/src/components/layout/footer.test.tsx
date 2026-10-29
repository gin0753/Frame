import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Footer } from './footer';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

it('preserves Blender credits and exposes the TMDB notice outside the collapsed disclosure', () => {
  const { container } = render(<Footer />);
  expect(screen.getByText(/Imagery © Blender Foundation/)).toBeVisible();
  const notice = screen.getByText(
    /This product uses the TMDB API but is not endorsed or certified by TMDB/,
  );
  expect(notice).toBeVisible();
  expect(notice.closest('details')).toBeNull();
  const logo = screen.getByRole('img', { name: 'TMDB — The Movie Database' });
  expect(logo).toHaveAttribute('src', '/images/brands/tmdb.svg');
  expect(logo).not.toHaveAttribute('srcset');
  expect(
    Number(logo.getAttribute('width')) / Number(logo.getAttribute('height')),
  ).toBeCloseTo(423.04 / 35.4, 8);
  expect(
    screen.getByRole('link', { name: 'TMDB — The Movie Database' }),
  ).toHaveAttribute('href', 'https://www.themoviedb.org');
  expect(container.querySelector('[aria-label="TMDB credits"] svg')).toBeNull();
  expect(logo.closest('details')).toBeNull();
});

it('ships a self-contained SVG wordmark with its original proportions and gradient', () => {
  const source = readFileSync(
    new NodeURL('../../../public/images/brands/tmdb.svg', import.meta.url),
    'utf8',
  );
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
  expect(svg.querySelector('parsererror')).toBeNull();
  expect(svg.doctype).toBeNull();
  expect(svg.documentElement.localName).toBe('svg');
  expect(svg.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 423.04 35.4');
  const allowed = new Set([
    'svg',
    'defs',
    'style',
    'linearGradient',
    'stop',
    'title',
    'g',
    'path',
  ]);
  for (const element of svg.querySelectorAll('*')) {
    expect(allowed.has(element.localName)).toBe(true);
    for (const attribute of element.attributes) {
      expect(attribute.name).not.toMatch(/^on/i);
      if (!attribute.name.startsWith('xmlns'))
        expect(attribute.value).not.toMatch(/javascript:|data:|https?:|\/\//i);
    }
  }
  for (const style of svg.querySelectorAll('style'))
    expect(style.textContent).not.toMatch(
      /@import|expression\(|url\((?!#[A-Za-z0-9_-]+\))/i,
    );
  expect(
    [...svg.querySelectorAll('stop')].map((stop) =>
      stop.getAttribute('stop-color'),
    ),
  ).toEqual(['#90cea1', '#3cbec9', '#00b3e5']);
});
