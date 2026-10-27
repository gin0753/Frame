// @vitest-environment node
import { expect, it } from 'vitest';
import { apiOrigin } from './api-origin';
it('accepts optional origin and trusted internal origin', () => {
  expect(apiOrigin(undefined)).toBeUndefined();
  expect(apiOrigin('https://api.internal.example/')).toBe(
    'https://api.internal.example',
  );
});
it.each([
  '',
  'secret',
  'http://user:secret@localhost',
  'http://localhost/api/v1',
  'http://localhost?x=1',
  'http://localhost#x',
  ' http://localhost',
  'http://localhost\\path',
])('rejects malformed origin without disclosure: %s', (value) => {
  expect(() => apiOrigin(value)).toThrow(
    /^FRAME_API_ORIGIN must be an HTTP\(S\) origin without credentials, path, query or fragment\.$/,
  );
});
