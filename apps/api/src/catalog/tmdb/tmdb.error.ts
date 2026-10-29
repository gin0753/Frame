export type TmdbErrorCategory =
  | 'CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'AUTHENTICATION'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'NOT_FOUND'
  | 'UNEXPECTED_RESPONSE';

// Never retain the upstream error, URL, body, headers or submitted values.
export class TmdbError extends Error {
  constructor(readonly category: TmdbErrorCategory) {
    super(`TMDB provider failure: ${category}`);
    this.name = 'TmdbError';
  }
}
