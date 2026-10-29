// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fixtureMovieSource } from './fixtures';

const publicRoot = new URL('../../../../public/', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('images/films/provenance.json', publicRoot), 'utf8'),
) as {
  entries: {
    files: { file: string; width: number; height: number; sha256: string }[];
  }[];
};

it('ships every normalized fixture image with matching provenance, dimensions and content hash', async () => {
  const movies = await fixtureMovieSource.listPreviews();
  expect(movies.map((movie) => movie.id)).toEqual([
    'charge',
    'sintel',
    'spring',
    'tears-of-steel',
    'cosmos-laundromat',
    'sprite-fright',
  ]);
  expect(new Set(movies.map((movie) => movie.id)).size).toBe(movies.length);
  for (const movie of movies) {
    expect(new URL(movie.exploreUrl).hostname).toBe('studio.blender.org');
    for (const image of [movie.backdrop, movie.poster]) {
      const source = manifest.entries
        .flatMap((entry) => entry.files)
        .find((file) => image.src.endsWith(`/${file.file}`));
      expect(source, image.src).toBeDefined();
      expect([image.width, image.height]).toEqual([
        source?.width,
        source?.height,
      ]);
      const bytes = readFileSync(
        fileURLToPath(new URL(image.src.slice(1), publicRoot)),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        source?.sha256,
      );
    }
  }
});
