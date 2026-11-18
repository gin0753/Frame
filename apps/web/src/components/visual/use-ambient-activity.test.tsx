import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAmbientActivity } from './use-ambient-activity';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('combines manual, live preference, visibility and intersection policies and removes subscriptions', () => {
  let reduced = false,
    hidden = false;
  const listeners = new Set<() => void>();
  const disconnect = vi.fn();
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_event: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_event: string, fn: () => void) =>
      listeners.delete(fn),
  }));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const ref = { current: document.createElement('div') };
  const { result, rerender, unmount } = renderHook(
    ({ paused, preview }) => useAmbientActivity(ref, paused, preview),
    { initialProps: { paused: false, preview: false } },
  );
  expect(result.current.mount).toBe(false);
  act(() => intersect([{ isIntersecting: true }]));
  expect(result.current.running).toBe(true);
  rerender({ paused: true, preview: false });
  expect(result.current.running).toBe(false);
  rerender({ paused: false, preview: false });
  expect(result.current.running).toBe(true);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(result.current.running).toBe(false);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    intersect([{ isIntersecting: false }]);
  });
  expect(result.current.mount).toBe(true);
  expect(result.current.running).toBe(false);
  act(() => {
    intersect([{ isIntersecting: true }]);
    reduced = true;
    listeners.forEach((fn) => fn());
  });
  expect(result.current.staticOnly).toBe(true);
  expect(result.current.mount).toBe(false);
  act(() => {
    reduced = false;
    listeners.forEach((fn) => fn());
  });
  expect(result.current.running).toBe(true);
  rerender({ paused: false, preview: true });
  expect(result.current.mount).toBe(false);
  unmount();
  expect(listeners.size).toBe(0);
  expect(disconnect).toHaveBeenCalledTimes(1);
});
