require('reflect-metadata');
const { TmdbAdapter } = require('../dist/catalog/tmdb/tmdb.adapter');
const { tmdbConfig } = require('../dist/catalog/tmdb/tmdb.config');
const {
  normalizeMoviePage,
  normalizeMovieDetail,
  normalizeGenre,
} = require('../dist/catalog/catalog.normalizer');

async function main() {
  if (!process.env.TMDB_READ_ACCESS_TOKEN) {
    console.log('REAL TMDB HTTP: NOT RUN — credentials unavailable');
    process.exitCode = 2;
    return;
  }
  const config = tmdbConfig({ ...process.env, TMDB_ENABLED: 'true' });
  const adapter = new TmdbAdapter({ config });
  // Five sequential, bounded requests, no retry, provider bodies never logged or saved.
  const trending = await adapter.trending('week');
  const popular = await adapter.popular();
  const genres = await adapter.genres();
  const detail = await adapter.details(11);
  const images = await adapter.imageConfiguration();
  normalizeMoviePage(trending, images, 1, true);
  normalizeMoviePage(popular, images, 1);
  normalizeMovieDetail(detail, images);
  genres.genres.forEach(normalizeGenre);
  if (
    !trending.results.length ||
    !popular.results.length ||
    !genres.genres.length ||
    detail.id !== 11 ||
    detail.title !== 'Star Wars'
  )
    throw new Error();
  console.log(
    'REAL TMDB HTTP: PASS — trending, popular, genres, movie 11 identity; no payload retained',
  );
}
main().catch(() => {
  console.error(
    'REAL TMDB HTTP: FAIL — check private configuration/provider availability; diagnostics suppressed',
  );
  process.exitCode = 1;
});
