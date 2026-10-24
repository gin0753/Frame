/** Normalized presentation model. Provider IDs and raw responses belong in adapters. */
export interface MovieImage {
  src: string;
  width: number;
  height: number;
  position?: string;
}

export interface MoviePreview {
  id: string;
  title: string;
  year: number;
  genres: readonly string[];
  synopsis: string;
  runtimeSeconds: number | null;
  backdrop: MovieImage;
  poster: MovieImage;
  /** Verified official destination until internal film routes exist. */
  exploreUrl: string;
  recognition?: { label: string; sourceUrl: string };
}
