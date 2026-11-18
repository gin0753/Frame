'use client';

import { useEffect, useRef } from 'react';
import { Renderer, Geometry, Program, Mesh } from 'ogl';
import { ambientFragment, ambientVertex } from './ambient-shader';

export type AmbientSettings = {
  speed: number;
  intensity: number;
  stars: number;
  palette: 'indigo' | 'blue';
};

export function CinematicAmbientBackground({
  settings,
  running,
  onStatus,
}: {
  settings: AmbientSettings;
  running: boolean;
  onStatus: (status: 'ready' | 'fallback') => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ settings, running, onStatus });
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    latest.current = { settings, running, onStatus };
    wake.current?.();
  }, [settings, running, onStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A canvas lets the GPU shade every pixel without animating DOM elements.
    let renderer: InstanceType<typeof Renderer> | undefined;
    let geometry: InstanceType<typeof Geometry> | undefined;
    let program: InstanceType<typeof Program> | undefined;
    let raf = 0;
    let disposed = false;
    let last = 0;
    let time = 0;
    const fail = () => latest.current.onStatus('fallback');
    const resizeObserver = new ResizeObserver(() => resize());
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      fail();
    };
    // The playground remounts a fresh renderer on restoration; never reuse lost resources.
    const restored = () => fail();
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      // OGL has no automatic component disposal. Release every owned GPU object.
      cancelAnimationFrame(raf);
      wake.current = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      geometry?.remove();
      if (program && renderer) {
        renderer.gl.deleteShader(program.vertexShader);
        renderer.gl.deleteShader(program.fragmentShader);
        program.remove();
      }
      // Strict Mode replays effects on the same canvas. Only lose a detached context.
      queueMicrotask(() => {
        if (!canvas.isConnected)
          renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();
      });
    };
    const resize = () => {
      if (!renderer) return;
      const width = Math.max(
        1,
        canvas.parentElement?.clientWidth ?? canvas.clientWidth,
      );
      const height = Math.max(
        1,
        canvas.parentElement?.clientHeight ?? canvas.clientHeight,
      );
      renderer.dpr = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(900000 / (width * height)),
      );
      renderer.setSize(width, height);
      if (program)
        program.uniforms.uResolution.value = [canvas.width, canvas.height];
      wake.current?.();
    };
    try {
      renderer = new Renderer({
        canvas,
        alpha: false,
        depth: false,
        antialias: false,
        dpr: 1,
        webgl: 1,
      });
      const gl = renderer.gl;
      geometry = new Geometry(gl, {
        position: {
          size: 2,
          data: new Float32Array([-1, -1, 3, -1, -1, 3]),
        },
      });
      // Uniforms update color, brightness and stars without rebuilding shaders.
      program = new Program(gl, {
        vertex: ambientVertex,
        fragment: ambientFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uResolution: { value: [1, 1] },
          uTime: { value: 0 },
          uIntensity: { value: 1 },
          uStars: { value: 0.35 },
          uBlue: { value: [0.04, 0.17, 0.4] },
          uPurple: { value: [0.25, 0.07, 0.4] },
        },
      });
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS))
        throw new Error('Ambient shader failed');
      const mesh = new Mesh(gl, { geometry, program });
      const draw = () => {
        if (
          disposed ||
          document.hidden ||
          gl.isContextLost() ||
          !program ||
          !renderer
        )
          return;
        const s = latest.current.settings;
        program.uniforms.uTime.value = time;
        program.uniforms.uIntensity.value = s.intensity;
        program.uniforms.uStars.value = s.stars;
        program.uniforms.uPurple.value =
          s.palette === 'indigo' ? [0.25, 0.07, 0.4] : [0.035, 0.23, 0.35];
        renderer.render({ scene: mesh });
      };
      const frame = (now: number) => {
        raf = 0;
        if (
          !latest.current.running ||
          latest.current.settings.speed === 0 ||
          document.hidden ||
          gl.isContextLost()
        ) {
          last = 0;
          return;
        }
        // Accumulate elapsed time at about 30 FPS; pausing never creates a time jump.
        if (!last || now - last >= 1000 / 30 - 1) {
          time += last
            ? Math.min((now - last) / 1000, 0.1) * latest.current.settings.speed
            : 0;
          last = now;
          draw();
        }
        raf = requestAnimationFrame(frame);
      };
      wake.current = () => {
        // One scheduler; cancelling RAF freezes the last successful frame.
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        if (!gl.isContextLost()) draw();
        if (
          latest.current.running &&
          latest.current.settings.speed !== 0 &&
          !document.hidden
        )
          raf = requestAnimationFrame(frame);
      };
      canvas.addEventListener('webglcontextlost', lost);
      canvas.addEventListener('webglcontextrestored', restored);
      resizeObserver.observe(canvas.parentElement ?? canvas);
      resize();
      latest.current.onStatus('ready');
    } catch {
      dispose?.();
      fail();
    }
    return () => {
      dispose?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-ambient-canvas="custom"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
