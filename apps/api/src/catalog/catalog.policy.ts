export const CATALOG_DEADLINE_MS = 2200;
export const CATALOG_COORDINATOR_OPTIONS = Symbol(
  'CATALOG_COORDINATOR_OPTIONS',
);
export type CatalogResource =
  'trending' | 'popular' | 'genres' | 'detail' | 'configuration';
export interface CatalogCoordinatorOptions {
  retentionEnabled: boolean;
  maxEntries: number;
  maxBytes: number;
  maxFlights: number;
  maxConsumers: number;
  maxConsumersPerFlight: number;
  operationTimeoutMs: number;
  minimumJoinRemainingMs: number;
  ttlMs: Record<CatalogResource, number>;
  now?: () => number;
}

// No operator flag can attest licensing on its own. Retention enablement needs a
// separately reviewed rights decision; synthetic tests may inject mechanics options.
export function catalogPolicy(
  env: NodeJS.ProcessEnv = process.env,
): CatalogCoordinatorOptions {
  const enabled = env.CATALOG_CACHE_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled))
    throw new Error('Invalid catalog policy');
  if (enabled === 'true')
    throw new Error(
      'Provider-content retention blocked pending rights verification',
    );
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const value = env[name];
    if (value === undefined) return fallback;
    if (!/^(?:0|[1-9][0-9]*)$/.test(value))
      throw new Error('Invalid catalog policy');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
      throw new Error('Invalid catalog policy');
    return parsed;
  };
  const ttl = (resource: string) =>
    integer(`CATALOG_CACHE_${resource}_TTL_SECONDS`, 0, 0, 86400) * 1000;
  return {
    retentionEnabled: false,
    maxEntries: integer('CATALOG_CACHE_MAX_ENTRIES', 128, 1, 1024),
    maxBytes: integer(
      'CATALOG_CACHE_MAX_BYTES',
      4 * 1024 * 1024,
      1024,
      16 * 1024 * 1024,
    ),
    maxFlights: integer('CATALOG_MAX_INFLIGHT', 32, 2, 128),
    maxConsumers: integer('CATALOG_MAX_CONSUMERS', 128, 2, 512),
    maxConsumersPerFlight: 32,
    operationTimeoutMs: CATALOG_DEADLINE_MS,
    minimumJoinRemainingMs: 1800,
    ttlMs: {
      trending: ttl('TRENDING'),
      popular: ttl('POPULAR'),
      genres: ttl('GENRES'),
      detail: ttl('DETAIL'),
      configuration: ttl('CONFIGURATION'),
    },
  };
}

// Fixed provider/environment scope per Nest application. No credentials in keys.
// Language is explicit even though current public routes authorize en-US only.
export function catalogKey(
  resource: CatalogResource,
  parameters: readonly (string | number)[] = [],
  language = 'en-US',
) {
  return JSON.stringify([
    'tmdb-v3',
    'frame-catalog-v1',
    'images-w500-w1280',
    resource,
    language,
    ...parameters,
  ]);
}
