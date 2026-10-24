import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MovieRail } from './movie-rail';
import Loading from '@/app/loading';
it('does not expose dead carousel controls for an empty selection', () => {
  render(
    <MovieRail
      id="test"
      title="Trending Now"
      eyebrow="CURATED"
      description="A selection"
      movies={[]}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Trending Now' })).toBeVisible();
  expect(screen.getByText(/No films in this selection/)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('exposes a loading announcement without interactive skeletons', () => {
  render(<Loading />);
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(
    'BRINGING THE PICTURE INTO FOCUS',
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
