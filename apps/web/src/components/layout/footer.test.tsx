import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Footer } from './footer';
import { assetCredits } from '@/features/movies/data/asset-credits';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

afterEach(cleanup);

it('groups one wordmark and tagline, offers real destinations and keeps a quiet factual closing', () => {
  const { rerender } = render(<Footer />);
  expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  const brand = screen.getByRole('link', { name: 'FRAME home' });
  expect(brand).toHaveAttribute('href', '#discover');
  expect(brand.parentElement).toContainElement(
    screen.getByText(/For the love of the/),
  );
  const nav = screen.getByRole('navigation', { name: 'Footer navigation' });
  expect(
    within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href')),
  ).toEqual(['/discover', '/search']);
  expect(screen.getByText('\u00a9 2026 FRAME')).toBeVisible();
  expect(screen.queryByText('An independent eye on cinema.')).toBeNull();
  expect(screen.queryByText('CURATED WITH INTENTION')).toBeNull();
  rerender(<Footer homeHref="/#discover" />);
  expect(screen.getByRole('link', { name: 'FRAME home' })).toHaveAttribute(
    'href',
    '/#discover',
  );
});

it('keeps the native disclosure closed initially and preserves every source, license and adaptation notice', async () => {
  const { container } = render(<Footer />);
  const details = container.querySelector('details')!;
  expect(details).toHaveAttribute('id', 'credits');
  expect(details).not.toHaveAttribute('open');
  const summary = details.querySelector('summary')!;
  await userEvent.click(summary);
  expect(details).toHaveAttribute('open');
  expect(within(details).getAllByRole('listitem')).toHaveLength(6);
  for (const credit of assetCredits) {
    const row = within(details)
      .getByRole('link', { name: credit.title })
      .closest('li')!;
    expect(
      within(row).getByRole('link', { name: credit.title }),
    ).toHaveAttribute('href', credit.source);
    expect(
      within(row).getByRole('link', { name: credit.license }),
    ).toHaveAttribute('href', credit.policy);
  }
  expect(
    within(details).getByText(/Stills resized, compressed and cropped/),
  ).toHaveTextContent(
    'poster-format artwork is a FRAME crop, not an official release poster. FRAME is an independent prototype with no Blender affiliation.',
  );
  expect(within(details).getByText(/See each project/)).toBeVisible();
  await userEvent.click(summary);
  expect(details).not.toHaveAttribute('open');
});

it('preserves Blender credits and exposes the TMDB notice outside the collapsed disclosure', () => {
  const { container } = render(<Footer />);
  expect(screen.getByText(/Imagery © Blender Foundation/)).toBeVisible();
  const notice = screen.getByText(
    'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  );
  expect(notice).toBeVisible();
  expect(screen.getByRole('group', { name: 'TMDB credits' })).toContainElement(
    notice,
  );
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
