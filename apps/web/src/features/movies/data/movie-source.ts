import type { MoviePreview } from '../model';
/** Replace the fixture implementation with an API adapter at the composition root. */
export interface MovieSource {
  listPreviews(): Promise<readonly MoviePreview[]>;
}
