type TransportEnvironment = {
  FRAME_LOCAL_API_PROXY?: string;
  FRAME_API_ORIGIN?: string;
};

/** Next config only: deployment ingress owns API routing outside local previews. */
export function localApiRewrites(environment: TransportEnvironment) {
  const enabled = environment.FRAME_LOCAL_API_PROXY;
  if (enabled === undefined || enabled === 'false') return [];
  if (enabled !== 'true') {
    throw new Error('FRAME_LOCAL_API_PROXY must be true or false.');
  }

  const value = environment.FRAME_API_ORIGIN;
  const invalidOrigin = () =>
    new Error(
      'Local API proxy requires FRAME_API_ORIGIN as a loopback HTTP(S) origin without credentials, path, query or fragment.',
    );
  if (!value || value !== value.trim()) throw invalidOrigin();

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw invalidOrigin();
  }
  if (
    !/^https?:\/\/[^/?#\\]+\/?$/i.test(value) ||
    origin.username ||
    origin.password ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  ) {
    // Never include an invalid operator-supplied value in errors/logs.
    throw invalidOrigin();
  }

  return [
    { source: '/api/v1/:path*', destination: `${origin.origin}/api/v1/:path*` },
  ];
}
