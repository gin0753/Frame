// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { localApiRewrites } from './local-api-rewrites';

describe('local API transport configuration', () => {
  it('leaves routing to deployment ingress unless explicitly enabled', () => {
    expect(localApiRewrites({})).toEqual([]);
    expect(
      localApiRewrites({
        FRAME_LOCAL_API_PROXY: 'false',
        FRAME_API_ORIGIN: 'https://api.internal.example',
      }),
    ).toEqual([]);
  });

  it.each([
    'http://127.0.0.1:3001',
    'http://localhost:3001/',
    'http://[::1]:3001',
    'https://localhost:3001',
  ])('preserves the API prefix for %s', (origin) => {
    expect(
      localApiRewrites({
        FRAME_LOCAL_API_PROXY: 'true',
        FRAME_API_ORIGIN: origin,
      }),
    ).toEqual([
      {
        source: '/api/v1/:path*',
        destination: `${new URL(origin).origin}/api/v1/:path*`,
      },
    ]);
  });

  it.each([
    undefined,
    '',
    'not-an-origin',
    'https://api.example.com',
    'file:///tmp/api',
    'http://127.0.0.1:3001/api/v1',
    'http://127.0.0.1:3001/../',
    'http://127.0.0.1:3001?target=other',
    'http://127.0.0.1:3001#fragment',
    'http://operator:private-value@localhost:3001',
    ' http://localhost:3001',
    'http://localhost:3001\\api',
  ])('fails closed for an unsafe local origin (%s)', (origin) => {
    expect(() =>
      localApiRewrites({
        FRAME_LOCAL_API_PROXY: 'true',
        FRAME_API_ORIGIN: origin,
      }),
    ).toThrow('requires FRAME_API_ORIGIN');
  });

  it('does not echo credentials supplied in invalid configuration', () => {
    expect(() =>
      localApiRewrites({
        FRAME_LOCAL_API_PROXY: 'true',
        FRAME_API_ORIGIN: 'http://operator:private-value@localhost:3001',
      }),
    ).toThrow(
      /^Local API proxy requires FRAME_API_ORIGIN as a loopback HTTP\(S\) origin without credentials, path, query or fragment\.$/,
    );
  });

  it('rejects ambiguous enablement rather than enabling accidentally', () => {
    expect(() => localApiRewrites({ FRAME_LOCAL_API_PROXY: '1' })).toThrow(
      'must be true or false',
    );
  });
});
