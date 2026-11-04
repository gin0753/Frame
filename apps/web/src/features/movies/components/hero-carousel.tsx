'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MoviePreview } from '../model';
import { Hero, HeroContent } from './hero';
import { MovieArtwork } from './movie-artwork';

const INTERVAL = 5000;
const reducedQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(notify: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
function subscribeVisibility(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}
const getReduced = () => window.matchMedia(reducedQuery).matches;
const getHidden = () => document.hidden;
// Never start autoplay before hydration establishes the user's environment.
const serverPaused = () => true;

export function HeroCarousel({ movies }: { movies: readonly MoviePreview[] }) {
  if (!movies.length) return null; // Homepage owns the truthful empty/failure state.
  if (movies.length === 1) return <Hero movie={movies[0]} />;
  return <HeroPlayer movies={movies} />;
}

function HeroPlayer({ movies }: { movies: readonly MoviePreview[] }) {
  const [slide, setSlide] = useState({
    // Requests advance independently; content, artwork and aria-current all
    // follow visualIndex only after the latest destination has settled.
    index: 0,
    visualIndex: 0,
    loaded: [0],
    ready: [] as number[],
    manual: false,
    announcement: '',
  });
  const [preference, setPreference] = useState<'auto' | 'paused' | 'playing'>(
    'auto',
  );
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    getReduced,
    serverPaused,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    getHidden,
    serverPaused,
  );
  const gesture = useRef<{
    x: number;
    y: number;
    time: number;
    id: number;
  } | null>(null);
  const requested =
    preference === 'playing' || (preference === 'auto' && !reduced);
  const running = requested && !keyboardFocus && !hidden;
  const select = useCallback(
    (target: number, manual = true, relative = false) => {
      setSlide((previous) => {
        const index =
          ((relative ? previous.index + target : target) + movies.length) %
          movies.length;
        // A displayed dot is a no-op, including while another image is pending.
        if (
          index === previous.index ||
          (!relative && index === previous.visualIndex)
        )
          return previous;
        const ready = previous.ready.includes(index);
        return {
          index,
          visualIndex: ready ? index : previous.visualIndex,
          ready: previous.ready,
          manual,
          announcement:
            manual && ready && index !== previous.visualIndex
              ? `Film ${index + 1} of ${movies.length}.`
              : '',
          loaded: [
            ...new Set([
              ...previous.loaded,
              index,
              (index + 1) % movies.length,
            ]),
          ],
        };
      });
    },
    [movies.length],
  );

  useEffect(() => {
    // One normal-priority lookahead after hydration; never mount all five images up front.
    const timer = window.setTimeout(
      () =>
        setSlide((previous) => ({
          ...previous,
          loaded: [...new Set([...previous.loaded, 1])],
        })),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => select(1, false, true), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [running, slide.index, select]);

  return (
    <section
      id="discover"
      className="cinema-hero hero-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured films"
      data-motion={reduced ? 'reduced' : 'full'}
      // Native focus-visible distinguishes Tab/programmatic keyboard focus from
      // pointer focus. Keydown also protects a control already focused by a click.
      onFocusCapture={(event) =>
        setKeyboardFocus(event.target.matches(':focus-visible'))
      }
      onKeyDownCapture={() => setKeyboardFocus(true)}
      onPointerDownCapture={() => setKeyboardFocus(false)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setKeyboardFocus(false);
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === 'mouse' ||
          (event.target as Element).closest('a, button')
        )
          return;
        gesture.current = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
          id: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (
          Math.abs(dx) >= 60 &&
          Math.abs(dx) > Math.abs(dy) * 1.5 &&
          Date.now() - start.time < 1000
        )
          select(dx < 0 ? 1 : -1, true, true);
      }}
    >
      <div className="hero-image" aria-hidden="true">
        {movies.map((movie, index) => (
          <div
            key={movie.id}
            className={`hero-frame ${index === slide.visualIndex ? 'hero-frame-active' : ''}`}
          >
            {slide.loaded.includes(index) && (
              <MovieArtwork
                artwork={movie.backdrop}
                preload={index === 0}
                loading={index === 0 ? undefined : 'eager'}
                sizes="100vw"
                className="hero-backdrop"
                onSettled={() =>
                  setSlide((previous) => ({
                    ...previous,
                    ready: [...new Set([...previous.ready, index])],
                    visualIndex:
                      previous.index === index ? index : previous.visualIndex,
                    announcement:
                      previous.index === index &&
                      previous.manual &&
                      index !== previous.visualIndex
                        ? `Film ${index + 1} of ${movies.length}.`
                        : previous.announcement,
                  }))
                }
              />
            )}
          </div>
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-copy-slot">
        {movies.map((movie, index) => (
          <HeroContent
            key={movie.id}
            movie={movie}
            active={index === slide.visualIndex}
          />
        ))}
      </div>
      <div className="hero-carousel-controls container-shell">
        <div
          className="hero-pagination"
          role="group"
          aria-label="Featured film selection"
        >
          {movies.map((movie, index) => (
            <button
              key={movie.id}
              type="button"
              className="hero-dot"
              aria-label={`Show featured film ${index + 1} of ${movies.length}: ${movie.title}`}
              aria-current={index === slide.visualIndex ? 'true' : undefined}
              onClick={() => select(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="hero-playback"
          aria-label={
            requested ? 'Pause featured films' : 'Play featured films'
          }
          onClick={() => setPreference(requested ? 'paused' : 'playing')}
        >
          {requested ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>
        <span className="sr-only" role="status">
          {slide.announcement}
        </span>
      </div>
    </section>
  );
}
