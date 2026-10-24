import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Carousel } from './carousel';

const state = vi.hoisted(() => ({
  prev: false,
  next: true,
  listeners: new Set<() => void>(),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
}));
vi.mock('embla-carousel-react', () => {
  const api = {
    canScrollPrev: () => state.prev,
    canScrollNext: () => state.next,
    scrollPrev: state.scrollPrev,
    scrollNext: state.scrollNext,
    on: (_event: string, callback: () => void) => {
      state.listeners.add(callback);
      return api;
    },
    off: (_event: string, callback: () => void) => {
      state.listeners.delete(callback);
      return api;
    },
  };
  return { default: () => [() => {}, api] };
});
beforeEach(() => {
  state.prev = false;
  state.next = true;
  state.listeners.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});

it('updates boundary controls when the carousel selection changes', async () => {
  const user = userEvent.setup();
  render(
    <Carousel label="Trending Now">
      <a href="#film">Film</a>
    </Carousel>,
  );
  expect(
    screen.getByRole('button', { name: 'Previous Trending Now' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next Trending Now' }));
  expect(state.scrollNext).toHaveBeenCalledWith(false);
  act(() => {
    state.prev = true;
    state.next = false;
    state.listeners.forEach((callback) => callback());
  });
  expect(
    screen.getByRole('button', { name: 'Next Trending Now' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Previous Trending Now' }),
  ).toBeEnabled();
});
it('supports viewport arrow keys and jumps when reduced motion is requested', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  render(
    <Carousel label="Popular Films">
      <a href="#film">Film</a>
    </Carousel>,
  );
  const viewport = screen.getByLabelText(
    'Popular Films film cards. Use left and right arrow keys to browse.',
  );
  viewport.focus();
  await user.keyboard('{ArrowRight}');
  expect(state.scrollNext).toHaveBeenCalledWith(true);
  state.scrollNext.mockClear();
  screen.getByRole('link', { name: 'Film' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(state.scrollNext).not.toHaveBeenCalled();
});
