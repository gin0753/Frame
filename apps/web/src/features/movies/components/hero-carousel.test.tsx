import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeroCarousel } from './hero-carousel';
import { movieFixtures } from '../data/fixtures';

let reduced = false,
  hidden = false;
const motionListeners = new Set<() => void>();
beforeEach(() => {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerType: string;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
        this.pointerId = init.pointerId ?? 1;
      }
    },
  );
  vi.useFakeTimers();
  reduced = false;
  hidden = false;
  settleAutomatically = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduced,
      addEventListener: (_type: string, fn: () => void) =>
        motionListeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) =>
        motionListeners.delete(fn),
    })),
  );
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  motionListeners.clear();
});
const movies = movieFixtures.slice(0, 5);
// Approved timing contract; independent of the implementation constant.
const AUTOPLAY_INTERVAL = 5000;
// Timer/focus cases settle real artwork through its neutral fallback in JSDOM.
// Dedicated handoff cases below control each actual image load/error explicitly.
let settleAutomatically = false;
const settleImages = () =>
  document
    .querySelectorAll('.hero-frame img')
    .forEach((image) => fireEvent.error(image));
const advance = (ms = AUTOPLAY_INTERVAL) => {
  act(() => vi.advanceTimersByTime(ms));
  if (settleAutomatically) settleImages();
};
const renderReady = (selected = movies) => {
  const result = render(<HeroCarousel movies={selected} />);
  settleAutomatically = true;
  advance(0);
  return result;
};
const dot = (index: number) =>
  screen.getByRole('button', {
    name: new RegExp(`^Show featured film ${index + 1} of`),
  });
const next = () => {
  const buttons = screen.getAllByRole('button', {
    name: /^Show featured film/,
  });
  const index = buttons.findIndex(
    (button) => button.getAttribute('aria-current') === 'true',
  );
  fireEvent.click(buttons[(index + 1) % buttons.length]);
  if (settleAutomatically) settleImages();
};
const title = () => screen.getByRole('heading', { level: 1 }).textContent;

it('starts with one accessible slide and advances only at five seconds, silently', () => {
  renderReady();
  expect(title()).toBe(movies[0].title);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[0].title);
  advance(1);
  expect(title()).toBe(movies[1].title);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
it('loops in both directions, announces manual positions and handles rapid navigation', () => {
  renderReady();
  fireEvent.click(dot(4));
  settleImages();
  expect(title()).toBe(movies[4].title);
  next();
  expect(title()).toBe(movies[0].title);
  for (let i = 0; i < 12; i++) next();
  expect(title()).toBe(movies[2].title);
  expect(screen.getByRole('status')).toHaveTextContent('Film 3 of 5.');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole('link')).toHaveLength(1);
});
it('resets the countdown on manual navigation', () => {
  renderReady();
  advance(AUTOPLAY_INTERVAL - 1000);
  next();
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[1].title);
  advance(1);
  expect(title()).toBe(movies[2].title);
});
it('explicit pause prevents advancement and resume starts a complete five-second interval', () => {
  renderReady();
  advance(AUTOPLAY_INTERVAL - 1000);
  fireEvent.click(screen.getByRole('button', { name: 'Pause featured films' }));
  advance(AUTOPLAY_INTERVAL * 3);
  expect(title()).toBe(movies[0].title);
  fireEvent.click(screen.getByRole('button', { name: 'Play featured films' }));
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[0].title);
  advance(1);
  expect(title()).toBe(movies[1].title);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
it('combines keyboard focus, visibility and explicit pause without overriding user preference', () => {
  renderReady();
  const region = screen.getByRole('region', { name: 'Featured films' });
  const control = dot(1);
  fireEvent.pointerEnter(region, { pointerType: 'mouse' });
  // Model native keyboard focus-visible state, which JSDOM does not track by input modality.
  const matches = control.matches.bind(control);
  vi.spyOn(control, 'matches').mockImplementation((selector) =>
    selector === ':focus-visible' ? true : matches(selector),
  );
  fireEvent.keyDown(control, { key: 'Tab' });
  act(() => control.focus());
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  advance(12000);
  expect(title()).toBe(movies[0].title);
  fireEvent.pointerLeave(region, { pointerType: 'mouse' });
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  advance();
  expect(title()).toBe(movies[0].title);
  fireEvent.click(screen.getByRole('button', { name: 'Pause featured films' }));
  fireEvent.blur(control, { relatedTarget: document.body });
  advance();
  expect(title()).toBe(movies[0].title);
  fireEvent.click(screen.getByRole('button', { name: 'Play featured films' }));
  advance();
  expect(title()).toBe(movies[1].title);
});
it('resumes keyboard focus pauses with a fresh countdown', () => {
  renderReady();
  advance(AUTOPLAY_INTERVAL - 1000);
  const control = dot(1);
  // Model keyboard focus-visible state independently of JSDOM input history.
  const matches = control.matches.bind(control);
  vi.spyOn(control, 'matches').mockImplementation((selector) =>
    selector === ':focus-visible' ? true : matches(selector),
  );
  act(() => control.focus());
  advance();
  act(() => control.blur());
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[0].title);
  advance(1);
  expect(title()).toBe(movies[1].title);
});
it.each(['background', 'text', 'controls'])(
  'continues autoplay while the pointer rests over Hero %s',
  (target) => {
    renderReady();
    const hovered =
      target === 'background'
        ? screen.getByRole('region', { name: 'Featured films' })
        : target === 'text'
          ? screen.getByRole('heading', { level: 1 })
          : dot(1);
    fireEvent.pointerEnter(hovered, { pointerType: 'mouse' });
    advance(AUTOPLAY_INTERVAL - 1);
    expect(title()).toBe(movies[0].title);
    advance(1);
    expect(title()).toBe(movies[1].title);
  },
);
it('mouse-click focus retains focus and restarts a full five-second countdown', () => {
  renderReady();
  advance(AUTOPLAY_INTERVAL - 1000);
  const control = dot(1);
  // JSDOM does not implement native pointer-versus-keyboard focus-visible heuristics.
  const matches = control.matches.bind(control);
  vi.spyOn(control, 'matches').mockImplementation((selector) =>
    selector === ':focus-visible' ? false : matches(selector),
  );
  fireEvent.pointerDown(control, { pointerType: 'mouse' });
  act(() => control.focus());
  fireEvent.click(control);
  expect(control).toHaveFocus();
  expect(title()).toBe(movies[1].title);
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[1].title);
  advance(1);
  expect(title()).toBe(movies[2].title);
  expect(control).toHaveFocus();
});
it('keyboard interaction protects a mouse-focused control until pointer activation resumes it', () => {
  renderReady();
  const control = dot(1);
  const matches = control.matches.bind(control);
  vi.spyOn(control, 'matches').mockImplementation((selector) =>
    selector === ':focus-visible' ? false : matches(selector),
  );
  fireEvent.pointerDown(control, { pointerType: 'mouse' });
  act(() => control.focus());
  fireEvent.click(control);
  fireEvent.keyDown(control, { key: 'Enter' });
  advance(12000);
  expect(title()).toBe(movies[1].title);
  fireEvent.pointerDown(control, { pointerType: 'mouse' });
  fireEvent.click(control);
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[1].title);
  advance(1);
  expect(title()).toBe(movies[2].title);
  expect(control).toHaveFocus();
});
it('defaults to paused with Reduced Motion, permits manual moves and explicit play', () => {
  reduced = true;
  renderReady();
  advance(18000);
  expect(title()).toBe(movies[0].title);
  next();
  expect(title()).toBe(movies[1].title);
  expect(
    screen.getByRole('region', { name: 'Featured films' }),
  ).toHaveAttribute('data-motion', 'reduced');
  fireEvent.click(screen.getByRole('button', { name: 'Play featured films' }));
  advance();
  expect(title()).toBe(movies[2].title);
});
it('responds to changing motion preference and cleans timers and subscriptions', () => {
  const result = renderReady();
  advance(0);
  reduced = true;
  act(() => motionListeners.forEach((fn) => fn()));
  advance();
  expect(title()).toBe(movies[0].title);
  reduced = false;
  act(() => motionListeners.forEach((fn) => fn()));
  advance();
  expect(title()).toBe(movies[1].title);
  result.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(motionListeners.size).toBe(0);
});
it.each([0, 1])('does not mount controls or timers for %i movie', (count) => {
  render(<HeroCarousel movies={movies.slice(0, count)} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});
it('mounts only the initial artwork and one lookahead, without exposing inactive CTAs', () => {
  const { container } = render(<HeroCarousel movies={movies} />);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  advance(0);
  expect(container.querySelectorAll('img')).toHaveLength(2);
  next();
  expect(container.querySelectorAll('img')).toHaveLength(3);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(container.querySelectorAll('[inert]')).toHaveLength(4);
});

it.each([2, 3, 4, 5])('loops correctly with %i featured films', (count) => {
  const selected = movies.slice(0, count);
  renderReady(selected);
  for (let index = 1; index <= count; index++) {
    advance();
    expect(title()).toBe(selected[index % count].title);
  }
});
it('ignores touch hover and combines explicit pause with visibility changes', () => {
  renderReady();
  fireEvent.pointerEnter(
    screen.getByRole('region', { name: 'Featured films' }),
    { pointerType: 'touch' },
  );
  advance();
  expect(title()).toBe(movies[1].title);
  fireEvent.click(screen.getByRole('button', { name: 'Pause featured films' }));
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  advance();
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  advance();
  expect(title()).toBe(movies[1].title);
});

it('suspends for document visibility alone and restarts a full countdown', () => {
  renderReady();
  advance(AUTOPLAY_INTERVAL - 1000);
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  advance(12000);
  expect(title()).toBe(movies[0].title);
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  advance(AUTOPLAY_INTERVAL - 1);
  expect(title()).toBe(movies[0].title);
  advance(1);
  expect(title()).toBe(movies[1].title);
});
it('accepts horizontal touch gestures while ignoring diagonal, short and cancelled gestures', () => {
  renderReady();
  const region = screen.getByRole('region', { name: 'Featured films' });
  region.setPointerCapture = vi.fn();
  const down = () =>
    fireEvent.pointerDown(region, {
      pointerType: 'touch',
      pointerId: 1,
      clientX: 200,
      clientY: 100,
    });
  const up = (x: number, y: number) =>
    fireEvent.pointerUp(region, {
      pointerType: 'touch',
      pointerId: 1,
      clientX: x,
      clientY: y,
    });
  down();
  up(170, 100);
  expect(title()).toBe(movies[0].title);
  down();
  up(100, 200);
  expect(title()).toBe(movies[0].title);
  down();
  fireEvent.pointerCancel(region);
  up(10, 100);
  expect(title()).toBe(movies[0].title);
  down();
  up(100, 104);
  expect(title()).toBe(movies[1].title);
  down();
  up(300, 104);
  expect(title()).toBe(movies[0].title);
});

it('keeps the previous artwork until the requested image settles and ignores stale completions', async () => {
  // JSDOM has no image layout; actual geometry is checked in Chromium.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { container } = render(<HeroCarousel movies={movies} />);
  advance(0);
  const frames = container.querySelectorAll('.hero-frame');
  await act(async () => {
    fireEvent.load(frames[0].querySelector('img')!);
  });
  next();
  expect(frames[0]).toHaveClass('hero-frame-active');
  expect(title()).toBe(movies[0].title);
  expect(dot(0)).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await act(async () => {
    fireEvent.load(frames[1].querySelector('img')!);
  });
  expect(frames[1]).toHaveClass('hero-frame-active');
  expect(title()).toBe(movies[1].title);
  expect(dot(1)).toHaveAttribute('aria-current', 'true');
  next(); // third image is still loading
  expect(frames[1]).toHaveClass('hero-frame-active');
  expect(title()).toBe(movies[1].title);
  expect(dot(1)).toHaveAttribute('aria-current', 'true');
  fireEvent.click(dot(3)); // fourth requested before third completes
  await act(async () => {
    fireEvent.load(frames[2].querySelector('img')!);
  });
  expect(frames[1]).toHaveClass('hero-frame-active');
  expect(title()).toBe(movies[1].title);
  expect(dot(1)).toHaveAttribute('aria-current', 'true');
  fireEvent.error(frames[3].querySelector('img')!);
  expect(frames[3]).toHaveClass('hero-frame-active');
  expect(title()).toBe(movies[3].title);
  expect(dot(3)).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Film 4 of 5.');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(frames[3].querySelector('[data-image-unavailable]')).toBeTruthy();
});

it.each([true, false])(
  'does not announce a cancelled pending swipe or its late image completion (initial artwork settled: %s)',
  async (initialReady) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<HeroCarousel movies={movies} />);
    advance(0);
    const frames = container.querySelectorAll('.hero-frame');
    if (initialReady)
      await act(async () => {
        fireEvent.load(frames[0].querySelector('img')!);
      });
    const region = screen.getByRole('region', { name: 'Featured films' });
    region.setPointerCapture = vi.fn();
    const swipe = (start: number, end: number) => {
      fireEvent.pointerDown(region, {
        pointerType: 'touch',
        pointerId: 1,
        clientX: start,
        clientY: 100,
      });
      fireEvent.pointerUp(region, {
        pointerType: 'touch',
        pointerId: 1,
        clientX: end,
        clientY: 100,
      });
    };
    const announcement = screen.getByRole('status');
    const initialAnnouncement = announcement.textContent;
    expect(title()).toBe(movies[0].title);
    swipe(200, 100); // Film two is requested, but its artwork stays pending.
    expect(title()).toBe(movies[0].title);
    expect(announcement.textContent).toBe(initialAnnouncement);
    swipe(100, 200); // Cancel back to the already displayed film.
    expect(title()).toBe(movies[0].title);
    expect(announcement.textContent).toBe(initialAnnouncement);
    if (!initialReady)
      await act(async () => {
        fireEvent.load(frames[0].querySelector('img')!);
      });
    expect(title()).toBe(movies[0].title);
    expect(announcement.textContent).toBe(initialAnnouncement);
    await act(async () => {
      fireEvent.load(frames[1].querySelector('img')!);
    });
    expect(title()).toBe(movies[0].title);
    expect(announcement.textContent).toBe(initialAnnouncement);
    expect(frames[0]).toHaveClass('hero-frame-active');
    expect(dot(0)).toHaveAttribute('aria-current', 'true');
  },
);

it('renders five named dots and keeps an active-dot click from resetting the countdown', () => {
  renderReady();
  expect(
    screen.getAllByRole('button', { name: /^Show featured film/ }),
  ).toHaveLength(5);
  expect(dot(0)).toHaveAccessibleName(
    `Show featured film 1 of 5: ${movies[0].title}`,
  );
  expect(
    screen.queryByRole('button', { name: /Previous|Next/ }),
  ).not.toBeInTheDocument();
  advance(AUTOPLAY_INTERVAL - 1000);
  fireEvent.click(dot(0));
  advance(999);
  expect(title()).toBe(movies[0].title);
  advance(1);
  expect(title()).toBe(movies[1].title);
});
it('keeps displayed content and position during autoplay pending images, ignoring superseded loads', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { container, unmount } = render(<HeroCarousel movies={movies} />);
  advance(0);
  const frames = container.querySelectorAll('.hero-frame');
  advance(); // requests second
  expect(title()).toBe(movies[0].title);
  expect(dot(0)).toHaveAttribute('aria-current', 'true');
  advance(); // requests third, even though second has not loaded
  await act(async () => {
    fireEvent.load(frames[1].querySelector('img')!);
  });
  expect(title()).toBe(movies[0].title);
  expect(frames[0]).toHaveClass('hero-frame-active');
  await act(async () => {
    fireEvent.load(frames[2].querySelector('img')!);
  });
  expect(title()).toBe(movies[2].title);
  expect(frames[2]).toHaveClass('hero-frame-active');
  expect(dot(2)).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('retains a failed destination fallback on revisit without another image attempt', () => {
  const { container } = render(<HeroCarousel movies={movies} />);
  advance(0);
  fireEvent.click(dot(3));
  const frames = container.querySelectorAll('.hero-frame');
  fireEvent.error(frames[3].querySelector('img')!);
  expect(title()).toBe(movies[3].title);
  fireEvent.click(dot(1));
  fireEvent.error(frames[1].querySelector('img')!);
  fireEvent.click(dot(3));
  expect(title()).toBe(movies[3].title);
  expect(frames[3].querySelector('img')).toBeNull();
  expect(frames[3].querySelector('[data-image-unavailable]')).toBeTruthy();
});
it('ignores displayed and repeated pending dots without delaying autoplay', () => {
  render(<HeroCarousel movies={movies} />);
  advance(AUTOPLAY_INTERVAL - 1000);
  fireEvent.click(dot(3));
  advance(AUTOPLAY_INTERVAL - 1000);
  fireEvent.click(dot(3)); // same pending request
  fireEvent.click(dot(0)); // displayed dot is also a no-op
  advance(1000); // autoplay requests fifth, not second or fourth
  const frames = document.querySelectorAll('.hero-frame');
  fireEvent.error(frames[3].querySelector('img')!);
  expect(title()).toBe(movies[0].title);
  fireEvent.error(frames[4].querySelector('img')!);
  expect(title()).toBe(movies[4].title);
});
