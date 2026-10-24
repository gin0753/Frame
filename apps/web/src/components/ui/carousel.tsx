'use client';
import { useCallback, useId, useSyncExternalStore } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
/** Server-rendered children stay outside the client bundle. Native scrolling is the no-JS fallback. */
export function Carousel({
  children,
  label,
  variant = 'landscape',
  heading,
}: {
  children: React.ReactNode;
  label: string;
  variant?: 'landscape' | 'poster';
  heading?: React.ReactNode;
}) {
  const [ref, api] = useEmblaCarousel({
    align: 'start',
    loop: false,
    slidesToScroll: 'auto',
  });
  const id = useId();
  const subscribe = useCallback(
    (notify: () => void) => {
      api?.on('select', notify).on('reInit', notify);
      return () => {
        api?.off('select', notify).off('reInit', notify);
      };
    },
    [api],
  );
  const prev = useSyncExternalStore(
    subscribe,
    () => api?.canScrollPrev() ?? false,
    () => false,
  );
  const next = useSyncExternalStore(
    subscribe,
    () => api?.canScrollNext() ?? false,
    () => false,
  );
  function scroll(direction: 'prev' | 'next') {
    const jump = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (direction === 'prev') api?.scrollPrev(jump);
    else api?.scrollNext(jump);
  }
  return (
    <div
      className={cn('carousel', `carousel-${variant}`, api && 'carousel-ready')}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      {heading}
      <div
        id={id}
        className="rail-viewport"
        ref={ref}
        tabIndex={0}
        aria-label={`${label} film cards. Use left and right arrow keys to browse.`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !api) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            scroll(event.key === 'ArrowRight' ? 'next' : 'prev');
          }
        }}
      >
        <div className="rail-track">{children}</div>
      </div>
      <div className="rail-controls">
        <Button
          variant="control"
          size="icon"
          className="rail-arrow"
          aria-label={`Previous ${label}`}
          aria-controls={id}
          disabled={!prev}
          onClick={() => scroll('prev')}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <Button
          variant="control"
          size="icon"
          className="rail-arrow"
          aria-label={`Next ${label}`}
          aria-controls={id}
          disabled={!next}
          onClick={() => scroll('next')}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
