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
it('keeps unavailable actions disabled and labelled without visible SOON labels', async () => {
  const user = userEvent.setup();
  render(<Header />);
  expect(
    screen.getByRole('button', { name: 'Account — coming soon' }),
  ).toBeDisabled();
  const search = screen.getByRole('button', { name: 'Search — coming soon' });
  expect(search).toBeDisabled();
  expect(search).toHaveAttribute('title', 'Search is not available yet');
  expect(screen.queryByText('SOON')).not.toBeInTheDocument();
  search.focus();
  expect(search).not.toHaveFocus();
  await user.click(search);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
