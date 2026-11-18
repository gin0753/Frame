import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CinematicAmbientBackground,
  type AmbientSettings,
} from './cinematic-ambient-background';

const gpu = vi.hoisted(() => ({
  fail: false,
  linked: true,
  render: vi.fn(),
  removeGeometry: vi.fn(),
  removeProgram: vi.fn(),
  deleteShader: vi.fn(),
  lose: vi.fn(),
  programs: [] as { uniforms: Record<string, { value: unknown }> }[],
  constructors: vi.fn(),
}));
vi.mock('ogl', () => ({
  Renderer: class {
    dpr = 1;
    gl = {
      deleteShader: gpu.deleteShader,
      getExtension: () => ({ loseContext: gpu.lose }),
      getProgramParameter: () => gpu.linked,
      isContextLost: () => false,
      LINK_STATUS: 1,
    };
    constructor() {
      gpu.constructors();
      if (gpu.fail) throw new Error('No WebGL');
    }
    setSize() {}
    render = gpu.render;
  },
  Geometry: class {
    remove = gpu.removeGeometry;
  },
  Program: class {
    uniforms: Record<string, { value: unknown }>;
    program = {};
    vertexShader = {};
    fragmentShader = {};
    constructor(
      _gl: unknown,
      options: { uniforms: Record<string, { value: unknown }> },
    ) {
      this.uniforms = options.uniforms;
      gpu.programs.push(this);
    }
    remove = gpu.removeProgram;
  },
  Mesh: class {},
}));
const settings: AmbientSettings = {
  speed: 0.35,
  intensity: 0.8,
  stars: 0.35,
  palette: 'indigo',
};
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let disconnect: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  gpu.fail = false;
  gpu.linked = true;
  gpu.programs.length = 0;
  frames = new Map();
  frameId = 0;
  disconnect = vi.fn();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('survives Strict Mode replay and explicitly releases GPU resources and RAF on unmount', async () => {
  const status = vi.fn();
  const view = render(
    <StrictMode>
      <CinematicAmbientBackground
        settings={settings}
        running
        onStatus={status}
      />
    </StrictMode>,
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith('ready'));
  expect(gpu.constructors).toHaveBeenCalledTimes(2);
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
  expect(gpu.removeGeometry).toHaveBeenCalledTimes(2);
  expect(gpu.removeProgram).toHaveBeenCalledTimes(2);
  expect(gpu.deleteShader).toHaveBeenCalledTimes(4);
  await waitFor(() => expect(gpu.lose).toHaveBeenCalledTimes(1));
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it('updates uniforms without rebuilding and stops/restarts the one loop', async () => {
  const status = vi.fn();
  const view = render(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith('ready'));
  view.rerender(
    <CinematicAmbientBackground
      settings={{ ...settings, intensity: 1.2, stars: 0.7, palette: 'blue' }}
      running={false}
      onStatus={status}
    />,
  );
  expect(frames.size).toBe(0);
  expect(gpu.programs[0].uniforms.uIntensity.value).toBe(1.2);
  expect(gpu.programs[0].uniforms.uStars.value).toBe(0.7);
  expect(gpu.programs[0].uniforms.uPurple.value).toEqual([0.035, 0.23, 0.35]);
  view.rerender(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  expect(frames.size).toBe(1);
  expect(gpu.constructors).toHaveBeenCalledTimes(1);
});

it('reports unavailable WebGL without throwing', async () => {
  gpu.fail = true;
  const status = vi.fn();
  render(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith('fallback'));
  expect(frames.size).toBe(0);
});

it('cleans partial shader initialization and reports a fallback', async () => {
  gpu.linked = false;
  const status = vi.fn();
  render(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith('fallback'));
  expect(gpu.removeGeometry).toHaveBeenCalled();
  expect(gpu.removeProgram).toHaveBeenCalled();
  expect(gpu.deleteShader).toHaveBeenCalledTimes(2);
});

it('reports context loss and cancels the render loop', async () => {
  const status = vi.fn();
  const view = render(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith('ready'));
  act(() =>
    view.container
      .querySelector('canvas')!
      .dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
  );
  expect(status).toHaveBeenLastCalledWith('fallback');
  expect(frames.size).toBe(0);
});

it('freezes animation time at zero speed, statically redraws and resumes one loop without rebuilding', () => {
  const status = vi.fn();
  const view = render(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  const tick = (now: number) =>
    act(() => {
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(now));
    });
  tick(1000);
  tick(1100);
  const time = gpu.programs[0].uniforms.uTime.value;
  view.rerender(
    <CinematicAmbientBackground
      settings={{ ...settings, speed: 0 }}
      running
      onStatus={status}
    />,
  );
  expect(frames.size).toBe(0);
  expect(gpu.programs[0].uniforms.uTime.value).toBe(time);
  const draws = gpu.render.mock.calls.length;
  view.rerender(
    <CinematicAmbientBackground
      settings={{ ...settings, speed: 0, intensity: 1.1, palette: 'blue' }}
      running
      onStatus={status}
    />,
  );
  expect(gpu.render).toHaveBeenCalledTimes(draws + 1);
  expect(frames.size).toBe(0);
  expect(gpu.programs[0].uniforms.uTime.value).toBe(time);
  view.rerender(
    <CinematicAmbientBackground
      settings={settings}
      running
      onStatus={status}
    />,
  );
  expect(frames.size).toBe(1);
  tick(9000);
  expect(gpu.programs[0].uniforms.uTime.value).toBe(time);
  tick(9100);
  expect(gpu.programs[0].uniforms.uTime.value).toBeCloseTo(
    Number(time) + 0.035,
  );
  expect(gpu.constructors).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(frames.size).toBe(0);
});
