// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/catalog', () => ({
  CatalogReadError: class extends Error {
    constructor(public status: number) {
      super();
    }
  },
  getMovieDetail: vi.fn(),
}));
import { CatalogReadError, getMovieDetail } from '@/lib/server/catalog';
import { readDetail } from './detail-data';
beforeEach(() => vi.resetAllMocks());
it('rejects malformed ids without a request', async () => {
  expect(await readDetail('01')).toEqual({ status: 'missing' });
  expect(getMovieDetail).not.toHaveBeenCalled();
});
it.each([
  [404, 'missing'],
  [429, 'busy'],
  [503, 'unavailable'],
] as const)('maps %s to %s', async (code, status) => {
  vi.mocked(getMovieDetail).mockRejectedValue(new CatalogReadError(code));
  expect(await readDetail('42')).toEqual({ status });
});
