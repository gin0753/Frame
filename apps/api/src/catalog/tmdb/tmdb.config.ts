import { TmdbError } from './tmdb.error';

export function tmdbConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.TMDB_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled))
    throw new TmdbError('CONFIGURATION');
  if (enabled === 'false') return { enabled: false } as const;
  const token = env.TMDB_READ_ACCESS_TOKEN;
  // Validate header-safe bearer syntax, not authenticity (only TMDB can do that).
  if (
    typeof token !== 'string' ||
    !token ||
    token.length > 4096 ||
    !/^[A-Za-z0-9._~+/-]+=*$/.test(token)
  )
    throw new TmdbError('CONFIGURATION');
  return { enabled: true, token } as const;
}
