import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Header } from './header';
it('opens an accessible mobile navigation and dismisses it with Escape', async () => {
  const user = userEvent.setup();
  render(<Header />);
  const trigger = screen.getByRole('button', { name: 'Open navigation' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'FRAME.' });
  expect(within(dialog).getByRole('link', { name: 'Films' })).toHaveAttribute(
    'href',
    '#films',
  );
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it.each(['Films', 'Collections'])(
  'closes the mobile menu and restores focus after choosing %s',
  async (section) => {
    const user = userEvent.setup();
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: section,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  },
);
it('enables Search while keeping accounts unavailable without visible SOON labels', () => {
  render(<Header />);
  expect(
    screen.getByRole('button', { name: 'Account — coming soon' }),
  ).toBeDisabled();
  const search = screen.getByRole('link', { name: 'Search' });
  expect(search).toHaveAttribute('href', '/search');
  expect(screen.queryByText('SOON')).not.toBeInTheDocument();
  search.focus();
  expect(search).toHaveFocus();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('uses homepage destinations and a current Search item on secondary pages', async () => {
  const user = userEvent.setup();
  const { container } = render(<Header searchPage />);
  expect(screen.getByRole('link', { name: 'FRAME home' })).toHaveAttribute(
    'href',
    '/#discover',
  );
  expect(screen.getByRole('link', { name: 'Films' })).toHaveAttribute(
    'href',
    '/#films',
  );
  expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(container.querySelector('.nav-current')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('link', { name: 'Search' })).toHaveAttribute(
    'href',
    '/search',
  );
  await user.click(within(dialog).getByRole('link', { name: 'Search' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
