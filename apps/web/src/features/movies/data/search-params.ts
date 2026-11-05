import { searchQuerySchema } from '@frame/contracts';

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const query = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  const blank = !q && !Array.isArray(params.q);
  const parsed = searchQuerySchema.safeParse({
    ...query,
    ...(blank ? { q: '_' } : {}),
  });
  if (!parsed.success) return { status: 'invalid' as const, q };
  return blank
    ? { status: 'initial' as const, q: '' }
    : { status: 'valid' as const, q: parsed.data.q };
}
