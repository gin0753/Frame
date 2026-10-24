import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { GenreBrowser } from './genre-browser';
import { movieFixtures } from '../data/fixtures';

it('resets the actual row only after the selected films have been committed', async () => {
  const user = userEvent.setup();
  render(<GenreBrowser movies={movieFixtures} />);
  await user.click(screen.getByText('View selected films'));
  const viewport = screen.getByRole('region', { name: 'Genre film results' });
  const filmsAtReset: string[][] = [];
  let scrollLeft = 260;
  Object.defineProperty(viewport, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
      filmsAtReset.push(
        within(viewport)
          .getAllByRole('heading')
          .map((heading) => heading.textContent ?? ''),
      );
    },
  });

  for (const name of [
    'Sci-fi',
    'Fantasy',
    'Adventure',
    'Comedy',
    'Show all films',
  ]) {
    await user.click(screen.getByRole('button', { name }));
  }

  expect(filmsAtReset).toEqual([
    ['Charge', 'Tears of Steel'],
    ['Sintel', 'Spring', 'Cosmos Laundromat'],
    ['Sintel', 'Spring'],
    ['Cosmos Laundromat', 'Sprite Fright'],
    movieFixtures.map((movie) => movie.title),
  ]);
  expect(viewport.scrollLeft).toBe(0);
  expect(screen.getByRole('status')).toHaveTextContent('All films / 6 films');
  await waitFor(() => expect(viewport.style.scrollSnapType).toBe(''));
});

it('restarts the film row for a new selection and retains filtering through collapse and reopen', async () => {
  const user = userEvent.setup();
  render(<GenreBrowser movies={movieFixtures} />);
  const disclosure = screen.getByText('View selected films');
  await user.click(disclosure);
  const viewport = screen.getByRole('region', { name: 'Genre film results' });
  viewport.scrollLeft = 260;
  const filter = screen.getByRole('button', { name: 'Sci-fi' });
  await user.click(filter);
  expect(viewport.scrollLeft).toBe(0);
  expect(filter).toHaveFocus();
  const charge = screen.getByRole('link', {
    name: 'Explore Charge on Blender Studio',
  });
  await user.click(disclosure);
  expect(charge).not.toBeVisible();
  expect(filter).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(
    'Science fiction / 2 films',
  );
  await user.click(disclosure);
  expect(charge).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Explore Spring on Blender Studio' }),
  ).not.toBeInTheDocument();
  viewport.scrollLeft = 120;
  await user.click(screen.getByRole('button', { name: 'Show all films' }));
  expect(viewport.scrollLeft).toBe(0);
  expect(screen.getByRole('status')).toHaveTextContent('All films / 6 films');
});

it('starts compact while allowing the full selection to be opened without filtering', async () => {
  const user = userEvent.setup();
  render(<GenreBrowser movies={movieFixtures} />);
  const charge = screen.getByRole('link', {
    name: 'Explore Charge on Blender Studio',
    hidden: true,
  });
  expect(charge).not.toBeVisible();
  await user.click(screen.getByText('View selected films'));
  expect(charge).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('All films / 6 films');
});

it('filters the selection, announces the count, and resets without moving focus', async () => {
  const user = userEvent.setup();
  render(<GenreBrowser movies={movieFixtures} />);
  const filter = screen.getByRole('button', {
    name: 'Sci-fi',
  });
  await user.click(filter);
  expect(filter).toHaveFocus();
  expect(filter).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(
    'Science fiction / 2 films',
  );
  expect(
    screen.getByRole('link', { name: 'Explore Charge on Blender Studio' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Explore Spring on Blender Studio' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show all films' }));
  expect(screen.getByRole('status')).toHaveTextContent('All films / 6 films');
  expect(filter).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Show all films' })).toBeDisabled();
});
it('allows deselecting a genre and presents a graceful empty state', async () => {
  const user = userEvent.setup();
  render(<GenreBrowser movies={[]} />);
  const filters = screen.getByRole('group', { name: 'Filter films by genre' });
  const fantasy = within(filters).getByRole('button', {
    name: 'Fantasy',
  });
  await user.click(fantasy);
  expect(
    screen.getByText('No films in this genre yet. Try another genre.'),
  ).toBeVisible();
  await user.click(fantasy);
  expect(screen.getByRole('status')).toHaveTextContent('All films / 0 films');
});
