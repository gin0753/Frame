import { Hero } from './hero';
import { MovieRail } from './movie-rail';
import { GenreBrowser } from './genre-browser';
import type { HomepageData } from '../data/homepage';

export function SectionState({
  id,
  title,
  loading = false,
  hero = false,
}: {
  id: string;
  title: string;
  loading?: boolean;
  hero?: boolean;
}) {
  return (
    <section
      id={id}
      className={hero ? 'cinema-hero' : 'film-section container-shell'}
      aria-labelledby={`${id}-state-heading`}
      aria-busy={loading || undefined}
    >
      <div className={hero ? 'hero-content container-shell' : 'rail-heading'}>
        {hero ? (
          <h1 id={`${id}-state-heading`}>{title}</h1>
        ) : (
          <h2 id={`${id}-state-heading`}>{title}</h2>
        )}
        <p role="status">
          {loading
            ? 'Loading film selection…'
            : 'This film selection is temporarily unavailable.'}
        </p>
        {loading && (
          <div
            className={`skeleton ${hero ? 'loading-hero' : 'aspect-video'}`}
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}

export async function HomepageHero({ data }: { data: HomepageData }) {
  const movie = await data.hero;
  return movie ? (
    <Hero movie={movie} />
  ) : (
    <SectionState id="discover" title="Featured film unavailable" hero />
  );
}

export async function HomepageRail({
  data,
  popular = false,
}: {
  data: HomepageData;
  popular?: boolean;
}) {
  const result = await (popular ? data.popular : data.trending);
  const id = popular ? 'films' : 'trending';
  const title = popular ? 'Popular Films' : 'Trending Now';
  if (result.status === 'failure')
    return <SectionState id={id} title={title} />;
  return (
    <MovieRail
      id={id}
      title={title}
      eyebrow={popular ? 'WORTH YOUR TIME' : 'THE DISCOVERY EDIT'}
      description={
        popular ? 'Popular movies on TMDB.' : 'Trending this week on TMDB.'
      }
      movies={result.data}
      variant={popular ? 'poster' : 'landscape'}
    />
  );
}

export async function HomepageGenres({ data }: { data: HomepageData }) {
  const result = await data.genres;
  if (result.status === 'failure')
    return <SectionState id="genres" title="Browse by Genre" />;
  return (
    <GenreBrowser
      movies={result.data}
      genres={result.choices}
      description={
        result.partial
          ? 'Filter the available subset of this Homepage selection. Some movie sources are unavailable.'
          : 'Filter this loaded Homepage selection, not the full TMDB catalog.'
      }
    />
  );
}
