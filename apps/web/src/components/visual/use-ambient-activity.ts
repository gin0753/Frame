'use client';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const subscribeVisibility = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};
const serverPaused = () => true;

// Shared browser policy only. Each renderer continues to own its GPU lifecycle.
export function useAmbientActivity(
  ref: RefObject<HTMLElement | null>,
  paused: boolean,
  previewReduced: boolean,
) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    serverPaused,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    serverPaused,
  );
  const [intersection, setIntersection] = useState({
    visible: false,
    seen: false,
  });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIntersection((previous) => ({
        visible: entry.isIntersecting,
        seen: previous.seen || entry.isIntersecting,
      }));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  const staticOnly = reduced || previewReduced;
  return {
    staticOnly,
    mount: intersection.seen && !staticOnly,
    running: !staticOnly && !paused && !hidden && intersection.visible,
  };
}
