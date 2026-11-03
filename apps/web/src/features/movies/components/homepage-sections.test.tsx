import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('embla-carousel-react', () => ({ default: () => [null, undefined] }));
import {
  HomepageGenres,
  HomepageHero,
  HomepageRail,
  SectionState,
} from './homepage-sections';
import type { HomepageData } from '../data/homepage';
import { movieFixtures } from '../data/fixtures';
const data = (overrides: Partial<HomepageData> = {}): HomepageData => ({
  hero: Promise.resolve([]),
  trending: Promise.resolve({ status: 'empty', data: [] }),
  popular: Promise.resolve({ status: 'empty', data: [] }),
  genres: Promise.resolve({
    status: 'empty',
    data: [],
    choices: [],
    partial: false,
  }),
  ...overrides,
});
it.each([
  ['discover', 'Featured film', true],
  ['trending', 'Trending Now', false],
  ['films', 'Popular Films', false],
  ['genres', 'Browse by Genre', false],
] as const)(
  'provides noninteractive %s loading geometry and heading',
  (id, title, hero) => {
    const { container } = render(
      <SectionState id={id} title={title} hero={hero} loading />,
    );
    expect(
      screen.getByRole('heading', { name: title, level: hero ? 1 : 2 }),
    ).toBeVisible();
    expect(container.querySelector(`#${id}`)).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(
      container.querySelector(
        '[aria-hidden="true"] .skeleton, .skeleton[aria-hidden="true"]',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('status')).toHaveLength(hero ? 1 : 0);
  },
);
it.each([false, true])(
  'distinguishes empty and failed rail (popular=%s)',
  async (popular) => {
    const first = render(await HomepageRail({ data: data(), popular }));
    expect(screen.getByText(/No .* films are available/)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    first.unmount();
    render(
      await HomepageRail({
        data: data({
          trending: Promise.resolve({ status: 'failure' }),
          popular: Promise.resolve({ status: 'failure' }),
        }),
        popular,
      }),
    );
    expect(screen.getByText(/temporarily unavailable/)).toBeVisible();
  },
);
it.each([false, true])(
  'retains sparse rail success (popular=%s)',
  async (popular) => {
    render(
      await HomepageRail({
        data: data({
          trending: Promise.resolve({
            status: 'success',
            data: movieFixtures.slice(0, 1),
          }),
          popular: Promise.resolve({
            status: 'success',
            data: movieFixtures.slice(0, 3),
          }),
        }),
        popular,
      }),
    );
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  },
);
it('distinguishes hero absence from source failure', async () => {
  const first = render(await HomepageHero({ data: data() }));
  expect(screen.getByText(/No featured film/)).toBeVisible();
  first.unmount();
  render(
    await HomepageHero({
      data: data({ trending: Promise.resolve({ status: 'failure' }) }),
    }),
  );
  expect(screen.getByText(/temporarily unavailable/)).toBeVisible();
});
it('preserves previews and truthful partial copy with no genre choices', async () => {
  render(
    await HomepageGenres({
      data: data({
        genres: Promise.resolve({
          status: 'success',
          data: [...movieFixtures],
          choices: [],
          partial: true,
        }),
      }),
    }),
  );
  expect(
    screen.getByText(/Genre filters are unavailable.*Some movie sources/),
  ).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('distinguishes genre failure from empty previews', async () => {
  const first = render(await HomepageGenres({ data: data() }));
  expect(screen.getByText(/No movie previews/)).toBeVisible();
  first.unmount();
  render(
    await HomepageGenres({
      data: data({ genres: Promise.resolve({ status: 'failure' }) }),
    }),
  );
  expect(screen.getByText(/temporarily unavailable/)).toBeVisible();
});

it('keeps a truthful empty featured state when Trending succeeds without eligible Hero artwork', async () => {
  const { container } = render(
    await HomepageHero({
      data: data({
        trending: Promise.resolve({
          status: 'success',
          data: movieFixtures.slice(0, 1),
        }),
      }),
    }),
  );
  expect(screen.getByText(/No featured film/)).toBeVisible();
  expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument();
  expect(container.querySelector('#discover')).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
