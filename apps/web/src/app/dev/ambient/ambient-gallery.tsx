'use client';

import dynamic from 'next/dynamic';
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useAmbientActivity } from '@/components/visual/use-ambient-activity';
import styles from './ambient-gallery.module.css';

const OriginalOGL = dynamic(
  () =>
    import('@/components/visual/cinematic-ambient-background').then(
      (module) => module.CinematicAmbientBackground,
    ),
  { ssr: false },
);
const DarkVeil = dynamic(
  () => import('@/components/visual/ambient-vendor/DarkVeil'),
  { ssr: false },
);
const Aurora = dynamic(
  () => import('@/components/visual/ambient-vendor/Aurora'),
  { ssr: false },
);

// Explicit client imports keep each vendor in an independently requested chunk.
const GhostFibers = dynamic(
  () => import('@/components/visual/gallery-vendor/GhostFibers'),
  { ssr: false },
);
const Silk = dynamic(() => import('@/components/visual/gallery-vendor/Silk'), {
  ssr: false,
});
const Orb = dynamic(() => import('@/components/visual/gallery-vendor/Orb'), {
  ssr: false,
});
const LightPillar = dynamic(
  () => import('@/components/visual/gallery-vendor/LightPillar'),
  { ssr: false },
);
const SideRays = dynamic(
  () => import('@/components/visual/gallery-vendor/SideRays'),
  { ssr: false },
);
const SoftAurora = dynamic(
  () => import('@/components/visual/gallery-vendor/SoftAurora'),
  { ssr: false },
);
const Galaxy = dynamic(
  () => import('@/components/visual/gallery-vendor/Galaxy'),
  { ssr: false },
);
const GridDistortion = dynamic(
  () => import('@/components/visual/gallery-vendor/GridDistortion'),
  { ssr: false },
);
const GridMotion = dynamic(
  () => import('@/components/visual/gallery-vendor/GridMotion'),
  { ssr: false },
);
const Lightning = dynamic(
  () => import('@/components/visual/gallery-vendor/Lightning'),
  { ssr: false },
);
const MagicRings = dynamic(
  () => import('@/components/visual/gallery-vendor/MagicRings'),
  { ssr: false },
);
const Radar = dynamic(
  () => import('@/components/visual/gallery-vendor/Radar'),
  { ssr: false },
);

const groups = [
  {
    name: 'Atmospheric',
    effects: [
      'Original OGL',
      'Dark Veil',
      'Aurora',
      'Ghost Fibers',
      'Silk',
      'Soft Aurora',
    ],
  },
  {
    name: 'Cosmic & Light',
    effects: [
      'Orb',
      'Light Pillar',
      'Side Rays',
      'Galaxy',
      'Lightning',
      'Magic Rings',
    ],
  },
  {
    name: 'Content & Interaction',
    effects: ['Grid Distortion', 'Grid Motion', 'Radar'],
  },
] as const;
type Candidate = (typeof groups)[number]['effects'][number];
type View = {
  paused: boolean;
  reduced: boolean;
  expanded: boolean;
  text: boolean;
};
const filmNames = ['Sintel', 'Spring', 'Tears of Steel'];
const filmSlugs = ['sintel', 'spring', 'tears-of-steel'];
const nativeControls: Record<
  Candidate,
  { label: string; min: number; max: number; step: number; initial: number }
> = {
  'Original OGL': {
    label: 'Intensity / brightness',
    min: 0,
    max: 1.4,
    step: 0.05,
    initial: 0.8,
  },
  'Dark Veil': { label: 'warp', min: 0, max: 2, step: 0.05, initial: 0.5 },
  Aurora: { label: 'amplitude', min: 0, max: 2, step: 0.05, initial: 0.5 },
  'Ghost Fibers': { label: 'threads', min: 16, max: 80, step: 1, initial: 32 },
  Silk: { label: 'scale', min: 0.5, max: 3, step: 0.1, initial: 1 },
  Orb: { label: 'size', min: 0.3, max: 1.4, step: 0.05, initial: 0.8 },
  'Light Pillar': {
    label: 'pillarWidth',
    min: 0.1,
    max: 2,
    step: 0.1,
    initial: 0.5,
  },
  'Side Rays': { label: 'spread', min: 0.1, max: 2, step: 0.1, initial: 0.8 },
  'Soft Aurora': {
    label: 'bandSpread',
    min: 0.1,
    max: 3,
    step: 0.1,
    initial: 1,
  },
  Galaxy: { label: 'density', min: 0.2, max: 2, step: 0.1, initial: 0.7 },
  Lightning: {
    label: 'intensity',
    min: 0.1,
    max: 0.8,
    step: 0.05,
    initial: 0.45,
  },
  'Magic Rings': { label: 'ringCount', min: 1, max: 8, step: 1, initial: 4 },
  'Grid Distortion': {
    label: 'strength',
    min: 0,
    max: 0.5,
    step: 0.01,
    initial: 0.15,
  },
  'Grid Motion': {
    label: 'Row drift speed (px/s)',
    min: 0,
    max: 30,
    step: 1,
    initial: 8,
  },
  Radar: { label: 'targets', min: 0, max: 20, step: 1, initial: 6 },
};

class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status" className={styles.error}>
        This renderer could not start. Choose another study or reset.
      </p>
    ) : (
      this.props.children
    );
  }
}

function Experiment({
  candidate,
  value,
  onValue,
  view,
  setView,
}: {
  candidate: Candidate;
  value: number;
  onValue: (value: number) => void;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
}) {
  const preview = useRef<HTMLDivElement>(null);
  const paused = view.paused;
  const setPaused = (paused: boolean) =>
    setView((previous) => ({ ...previous, paused }));
  const reduced = view.reduced;
  const setReduced = (reduced: boolean) =>
    setView((previous) => ({ ...previous, reduced }));
  const expanded = view.expanded;
  const setExpanded = (expanded: boolean) =>
    setView((previous) => ({ ...previous, expanded }));
  const text = view.text;
  const setText = (text: boolean) =>
    setView((previous) => ({ ...previous, text }));
  const [pointer, setPointer] = useState(candidate === 'Grid Motion');
  const [film, setFilm] = useState(0);
  const [posters, setPosters] = useState(true);
  const [results, setResults] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [reset, setReset] = useState(0);
  const [failure, setFailure] = useState('');
  const native = nativeControls[candidate];
  const setValue = onValue;
  const legacy =
    candidate === 'Original OGL' ||
    candidate === 'Dark Veil' ||
    candidate === 'Aurora';
  const [status, setStatus] = useState<'initializing' | 'ready' | 'fallback'>(
    'initializing',
  );
  const [speed, setSpeed] = useState(0.35);
  const [brightness, setBrightness] = useState(0.8);
  const [stars, setStars] = useState(0.35);
  const [palette, setPalette] = useState<'indigo' | 'blue'>('indigo');
  const colors =
    palette === 'indigo'
      ? ['#3666bc', '#7160cb', '#344e9c']
      : ['#256ca3', '#398da0', '#3057a4'];
  const activity = useAmbientActivity(preview, paused, reduced);
  // Legacy wrappers support native static redraw while paused (resize regression coverage).
  const mount =
    (legacy ? activity.mount : activity.running) &&
    !failure &&
    status !== 'fallback';
  const running = activity.running && mount;
  const imageSrc = `/images/films/${filmSlugs[film]}-backdrop.webp`;
  const items = filmSlugs.map((slug, i) => ({
    src: `/images/films/${slug}-${posters ? 'poster' : 'backdrop'}.webp`,
    alt: `${filmNames[i]} — Blender Foundation`,
  }));

  // The gallery owns the mount policy, not vendor clocks. Native effects own deletion.
  // A detached context is also released after partial initialization/error paths.
  useEffect(() => {
    const root = preview.current;
    if (!root || !mount) return;
    const canvases = new Set<HTMLCanvasElement>();
    const collect = () => {
      root.querySelectorAll('canvas').forEach((canvas) => {
        canvases.add(canvas);
        if (canvas.dataset.galleryReady) setStatus('ready');
      });
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailure('Graphics context lost. Reset to retry.');
    };
    const observer = new MutationObserver(collect);
    collect();
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-gallery-ready'],
    });
    root.addEventListener('webglcontextlost', onLost, true);
    const check = window.setInterval(() => {
      collect();
      for (const canvas of canvases) {
        if (canvas.dataset.galleryFailed)
          setFailure(canvas.dataset.galleryFailed);
        try {
          if (
            !canvas.getContext(
              candidate === 'Original OGL' ? 'webgl' : 'webgl2',
            )
          )
            setFailure('WebGL2 is unavailable. Static preview shown.');
        } catch {
          setFailure('WebGL2 could not start. Static preview shown.');
        }
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      collect();
      if (
        candidate !== 'Grid Motion' &&
        root.dataset.rendererStatus !== 'ready' &&
        ![...canvases].some((canvas) => canvas.dataset.galleryReady)
      ) {
        setFailure(
          'Renderer did not become ready. Static preview shown; reset to retry.',
        );
      }
    }, 30000);
    return () => {
      observer.disconnect();
      window.clearInterval(check);
      window.clearTimeout(timeout);
      root.removeEventListener('webglcontextlost', onLost, true);
      queueMicrotask(() =>
        canvases.forEach((canvas) => {
          if (canvas.isConnected) return;
          try {
            const gl =
              candidate === 'Original OGL'
                ? canvas.getContext('webgl')
                : canvas.getContext('webgl2');
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
          } catch {
            /* Already unavailable. */
          }
        }),
      );
    };
  }, [mount, reset, candidate]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setView((previous) => ({ ...previous, expanded: false }));
      if (event.key === 'Tab') {
        const controls = preview.current
          ?.closest('section')
          ?.querySelectorAll<HTMLElement>('button, input, select, a[href]');
        const first = controls?.[0],
          last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, setView]);

  let effect: ReactNode;
  switch (candidate) {
    case 'Original OGL':
      effect = (
        <OriginalOGL
          settings={{ speed, intensity: value, stars, palette }}
          running={running}
          onStatus={setStatus}
        />
      );
      break;
    case 'Dark Veil':
      effect = (
        <DarkVeil
          color={colors[1]}
          speed={speed}
          brightness={brightness}
          warp={value}
          flow={0.6}
          glow={0.25}
          grain={0.012}
          quality={0.4}
          dpr={0.8}
          intro={false}
          mouseInteraction={pointer}
          paused={!running}
          onStatus={setStatus}
        />
      );
      break;
    case 'Aurora':
      effect = (
        <Aurora
          colorStops={colors}
          speed={speed}
          brightness={brightness}
          amplitude={value}
          blend={0.7}
          height={0.62}
          layers={2}
          dpr={0.8}
          intro={false}
          mouseInteraction={pointer}
          paused={!running}
          onStatus={setStatus}
        />
      );
      break;
    case 'Ghost Fibers':
      effect = (
        <GhostFibers
          threads={value}
          layers={2}
          particles={0}
          glow={0.2}
          dpr={0.75}
          intro={false}
          mouseInteraction={pointer}
        />
      );
      break;
    case 'Silk':
      effect = (
        <Silk
          scale={value}
          speed={1}
          color="#464c85"
          dpr={0.75}
          intro={false}
          mouseInteraction={pointer}
          clickRipple={false}
        />
      );
      break;
    case 'Orb':
      effect = (
        <Orb
          size={value}
          speed={0.3}
          colors={['#4576dd', '#9167d9']}
          dpr={0.75}
          intro={false}
          followCursor={pointer}
          clickPulse={false}
        />
      );
      break;
    case 'Light Pillar':
      effect = (
        <LightPillar
          pillarWidth={value}
          quality="low"
          resolution={0.65}
          rotationSpeed={0.2}
          intro={false}
          interactive={pointer}
          clickPulse={false}
        />
      );
      break;
    case 'Side Rays':
      effect = (
        <SideRays
          spread={value}
          speed={0.3}
          maxDevicePixelRatio={1}
          intro={false}
          followMouse={pointer}
        />
      );
      break;
    case 'Soft Aurora':
      effect = (
        <SoftAurora
          bandSpread={value}
          speed={0.3}
          intro={false}
          enableMouseInteraction={pointer}
          clickPulse={false}
        />
      );
      break;
    case 'Galaxy':
      effect = (
        <Galaxy
          density={value}
          speed={0.3}
          dpr={0.75}
          intro={false}
          mouseInteraction={pointer}
          clickWarp={false}
        />
      );
      break;
    case 'Lightning':
      effect = (
        <Lightning
          intensity={value}
          flicker={0.25}
          speed={0.3}
          dpr={0.75}
          intro={false}
          mouseInteraction={pointer}
          clickStrike={false}
        />
      );
      break;
    case 'Magic Rings':
      effect = (
        <MagicRings
          ringCount={value}
          motion="breathe"
          speed={0.3}
          maxDevicePixelRatio={1}
          intro={false}
          followMouse={pointer}
          clickBurst={false}
        />
      );
      break;
    case 'Grid Distortion':
      effect = (
        <GridDistortion
          imageSrc={imageSrc}
          strength={value}
          mode="drag"
          intro={false}
          clickRipple={false}
        />
      );
      break;
    case 'Grid Motion':
      effect = (
        <GridMotion
          items={items}
          rows={3}
          speed={value}
          aspectRatio={posters ? 2 / 3 : 16 / 9}
          parallax={pointer ? 0.3 : 0}
        />
      );
      break;
    case 'Radar':
      effect = (
        <Radar
          targets={value}
          speed={0.3}
          dpr={0.75}
          intro={false}
          mouseInteraction={pointer}
        />
      );
      break;
  }
  return (
    <section
      className={`${styles.study} ${expanded ? styles.studyExpanded : ''}`}
      aria-label={`${candidate} experiment`}
    >
      <div className={styles.toolbar}>
        <h2>{candidate}</h2>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-pressed={expanded}
        >
          {expanded ? 'Close expanded preview' : 'Expand preview'}
        </button>
      </div>
      <div
        ref={preview}
        className={`${styles.preview} ${expanded ? styles.expanded : ''}`}
        data-candidate={candidate}
        data-running={running}
        data-ambient-preview={
          candidate === 'Original OGL'
            ? 'custom'
            : candidate === 'Dark Veil'
              ? 'dark-veil'
              : candidate === 'Aurora'
                ? 'aurora'
                : undefined
        }
        data-renderer-status={
          activity.staticOnly
            ? 'static'
            : failure || status === 'fallback'
              ? 'fallback'
              : candidate === 'Grid Motion' && mount
                ? 'ready'
                : status
        }
      >
        <div
          className={`${styles.static} ${candidate === 'Lightning' ? styles.staticLightning : ''}`}
          aria-hidden="true"
        >
          {(candidate === 'Grid Distortion' || candidate === 'Grid Motion') && (
            // Native img is intentional: these are the same local test assets passed to vendor APIs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt="" />
          )}
        </div>
        {mount && (
          <PreviewBoundary key={reset}>
            <div
              className={styles.effect}
              data-dom={candidate === 'Grid Motion'}
              aria-hidden="true"
            >
              {effect}
            </div>
          </PreviewBoundary>
        )}
        {text && (
          <div className={styles.center}>
            <p className={styles.kicker}>FRAME / A VISUAL STUDY</p>
            <h3>
              Stories beyond
              <br />
              the ordinary.
            </h3>
            <p>Light, movement, and room for the story.</p>
            {candidate === 'Magic Rings' && (
              <>
                <button type="button" onClick={() => setClicks(clicks + 1)}>
                  Test centered action
                </button>
                <span role="status">
                  Centered action activated {clicks} times
                </span>
              </>
            )}
            {candidate === 'Radar' && (
              <>
                <p role="status" aria-live="polite">
                  {results
                    ? 'Preview ready — 3 sample films.'
                    : 'Exploring a sample film collection…'}
                </p>
                <button type="button" onClick={() => setResults(!results)}>
                  {results
                    ? 'Restart conceptual loading'
                    : 'Show conceptual results'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <p className={styles.state} role="status">
        {failure ||
          (status === 'fallback'
            ? 'Static fallback — reset to retry WebGL.'
            : '') ||
          (activity.staticOnly
            ? 'Static alternative — reduced motion.'
            : paused
              ? 'Paused — static alternative.'
              : legacy
                ? 'Live study. Native pause preserves the current frame.'
                : 'Live study. Pause restarts the renderer on resume.')}
      </p>
      <div className={styles.controls}>
        <label>
          {native.label}: <output>{value}</output>
          <input
            aria-label={native.label}
            type="range"
            min={native.min}
            max={native.max}
            step={native.step}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        {legacy && (
          <>
            <label>
              Speed{' '}
              <input
                aria-label="Speed"
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </label>
            {candidate !== 'Original OGL' && (
              <label>
                Intensity / brightness{' '}
                <input
                  aria-label="Intensity / brightness"
                  type="range"
                  min="0"
                  max="1.4"
                  step="0.05"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </label>
            )}
            {candidate === 'Original OGL' && (
              <label>
                Stars{' '}
                <input
                  aria-label="Stars"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={stars}
                  onChange={(e) => setStars(Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Palette{' '}
              <select
                aria-label="Palette"
                value={palette}
                onChange={(e) =>
                  setPalette(e.target.value as 'indigo' | 'blue')
                }
              >
                <option value="indigo">Indigo</option>
                <option value="blue">Blue</option>
              </select>
            </label>
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={reduced}
            onChange={(event) => setReduced(event.target.checked)}
          />
          Reduced-motion preview
        </label>
        <label>
          <input
            type="checkbox"
            checked={text}
            onChange={(event) => setText(event.target.checked)}
          />
          Centered content
        </label>
        {candidate !== 'Grid Distortion' && candidate !== 'Original OGL' && (
          <label>
            <input
              type="checkbox"
              checked={pointer}
              onChange={(event) => setPointer(event.target.checked)}
            />
            {candidate === 'Grid Motion'
              ? 'Row parallax'
              : 'Pointer interaction'}
          </label>
        )}
        {candidate === 'Grid Distortion' && (
          <label>
            imageSrc
            <select
              value={film}
              onChange={(event) => setFilm(Number(event.target.value))}
            >
              {filmNames.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {candidate === 'Grid Motion' && (
          <label>
            <input
              type="checkbox"
              checked={posters}
              onChange={(event) => setPosters(event.target.checked)}
            />
            Poster-format items (off: stills)
          </label>
        )}
        <button
          type="button"
          onClick={() => {
            setFailure('');
            setStatus('initializing');
            setValue(native.initial);
            setSpeed(0.35);
            setBrightness(0.8);
            setStars(0.35);
            setPalette('indigo');
            setPointer(candidate === 'Grid Motion');
            setFilm(0);
            setPosters(true);
            setResults(false);
            setClicks(0);
            setView((previous) => ({
              ...previous,
              paused: false,
              reduced: false,
              text: true,
            }));
            setReset(reset + 1);
          }}
        >
          Reset defaults
        </button>
      </div>
      {candidate === 'Lightning' && (
        <p className={styles.note}>
          Animated lightning contains flashes. Reduced motion replaces it with a
          still light streak and mounts no renderer.
        </p>
      )}
      {candidate === 'Grid Distortion' && (
        <p className={styles.note}>
          Move across the image to test the native drag field. No film requests
          are sent.
        </p>
      )}
      {(candidate === 'Grid Distortion' || candidate === 'Grid Motion') && (
        <p className={styles.note}>
          Imagery © Blender Foundation.{' '}
          <a href="https://durian.blender.org/sharing/">Sintel — CC BY 3.0</a>;{' '}
          <a href="https://studio.blender.org/projects/spring/pages/about/">
            Spring — CC BY 4.0
          </a>
          ;{' '}
          <a href="https://mango.blender.org/sharing/">
            Tears of Steel — CC BY 3.0
          </a>
          . Existing stills are resized/WebP compressed; poster-format images
          are crops, not official posters.
        </p>
      )}
      <p className={styles.note}>
        {candidate === 'Original OGL' ? (
          <>
            Original FRAME GLSL ·{' '}
            <a href="https://github.com/oframe/ogl/tree/1.0.11">
              OGL 1.0.11 source
            </a>{' '}
            (Unlicense). Local provenance: cinematic-ambient-background.tsx and
            ambient-shader.ts.
          </>
        ) : (
          <>
            <a
              href={
                'https://github.com/DavidHDev/react-bits/tree/' +
                (legacy
                  ? 'b0422bb475ac9ec1fe1680290970494ceff5d4eb'
                  : '9d9c687dc4f55b23539aa5417b703078047efa74') +
                '/src/ts-default/Backgrounds/' +
                candidate.replaceAll(' ', '')
              }
            >
              Pinned React Bits source
            </a>{' '}
            · MIT + Commons Clause. Provenance:{' '}
            {legacy ? 'ambient-vendor' : 'gallery-vendor'}/PROVENANCE.md.
          </>
        )}{' '}
        Development evaluation; no production selection.
      </p>
    </section>
  );
}

export function AmbientGallery() {
  const [active, setActive] = useState<Candidate | null>(null);
  const [values, setValues] = useState<Partial<Record<Candidate, number>>>({});
  const [view, setView] = useState<View>({
    paused: false,
    reduced: false,
    expanded: false,
    text: true,
  });
  return (
    <>
      <div aria-label="Effect selection" inert={view.expanded}>
        {groups.map((group) => (
          <section
            key={group.name}
            className={styles.group}
            aria-label={group.name}
          >
            <h2>{group.name}</h2>
            <div className={styles.choices}>
              {group.effects.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active === name}
                  onClick={() => setActive(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {active ? (
        <Experiment
          key={active}
          candidate={active}
          value={values[active] ?? nativeControls[active].initial}
          onValue={(value) =>
            setValues((previous) => ({ ...previous, [active]: value }))
          }
          view={view}
          setView={setView}
        />
      ) : (
        <p className={styles.empty}>
          Choose an effect to start. No experimental renderer is loaded yet.
          Lightning contains animated flashes.
        </p>
      )}
    </>
  );
}
