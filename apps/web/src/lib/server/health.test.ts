// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({})); // Unit-only: real Next transport verifies this boundary separately.
import { getApiHealth } from './health';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('server health contract consumer (unit transport doubles)', () => {
  it('validates unknown JSON and preserves trusted origin, no-store, redirect and timeout options', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ status: 'ok', service: 'frame-api' }));
    vi.stubGlobal('fetch', fetch);
    await expect(getApiHealth()).resolves.toEqual({
      status: 'ok',
      service: 'frame-api',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:3001/api/v1/health');
    const options = fetch.mock.calls[0][1];
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toBeUndefined();
    expect(options.credentials).toBeUndefined();
  });
  it.each([
    null,
    {},
    { status: 'ready', service: 'frame-api' },
    { status: 'ok', service: 42 },
    { status: 'ok', service: 'frame-api', password: 'INJECTED_SECRET' },
  ])(
    'rejects a malformed success payload without echoing it: %j',
    async (body) => {
      vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
      await expect(getApiHealth()).rejects.toThrow(
        'FRAME API unavailable or invalid response.',
      );
    },
  );
  it.each(['http', 'non-json', 'invalid-json', 'refusal', 'timeout'])(
    'normalizes %s failures',
    async (mode) => {
      vi.stubEnv('FRAME_API_ORIGIN', 'http://127.0.0.1:3001');
      const fetch = vi.fn();
      if (mode === 'refusal' || mode === 'timeout')
        fetch.mockRejectedValue(new Error('INJECTED_SECRET'));
      else
        fetch.mockResolvedValue(
          mode === 'http'
            ? Response.json(
                { status: 'ok', service: 'frame-api' },
                { status: 503 },
              )
            : new Response(mode === 'invalid-json' ? '{' : 'INJECTED_SECRET', {
                headers: {
                  'content-type':
                    mode === 'invalid-json' ? 'application/json' : 'text/html',
                },
              }),
        );
      vi.stubGlobal('fetch', fetch);
      await expect(getApiHealth()).rejects.toThrow(
        'FRAME API unavailable or invalid response.',
      );
    },
  );
  it('requires an explicitly configured origin before making a request', async () => {
    vi.stubEnv('FRAME_API_ORIGIN', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(getApiHealth()).rejects.toThrow('FRAME_API_ORIGIN');
    expect(fetch).not.toHaveBeenCalled();
  });
});
