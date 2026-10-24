import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button } from './button';
it('preserves anchor semantics when composed with a link', () => {
  render(
    <Button asChild>
      <a href="#studies">Explore</a>
    </Button>,
  );
  expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute(
    'href',
    '#studies',
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('exposes a native disabled state', () => {
  render(<Button disabled>Later</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});
