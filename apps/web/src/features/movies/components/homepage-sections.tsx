import { Hero } from './hero';
import { MovieRail } from './movie-rail';
import { GenreBrowser } from './genre-browser';
import type { HomepageData } from '../data/homepage';

/** Static skeletons avoid motion and interactive loading controls. */
export function SectionState({
  id,
  title,
  loading = false,
  hero = false,
  message,
}: {
  id: string;
  title: string;
  loading?: boolean;
  hero?: boolean;
  message?: string;
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
        <p
          className="rail-description"
          role={loading && hero ? 'status' : undefined}
        >
          {loading
            ? `Loading ${title.toLowerCase()}...`
            : (message ??
              'This film selection is temporarily unavailable. Explore the other collections below.')}
        </p>
        {loading && hero && (
          <div className="hero-placeholder" aria-hidden="true">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-overview" />
            <div className="skeleton skeleton-metadata" />
            <div className="skeleton skeleton-action" />
          </div>
        )}
      </div>
      {loading && !hero && (
        <div
          aria-hidden="true"
          className={`section-placeholders ${id === 'films' ? 'carousel-poster' : ''}`}
        >
          {Array.from({ length: id === 'genres' ? 6 : 4 }, (_, index) => (
            <div
              key={index}
              className={
                id === 'genres' ? 'skeleton skeleton-genre' : 'rail-slide'
              }
            >
              {id !== 'genres' && (
                <>
                  <div
                    className={`skeleton ${id === 'films' ? 'skeleton-poster' : 'skeleton-landscape'}`}
                  />
                  <div className="skeleton skeleton-caption" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export async function HomepageHero({ data }: { data: HomepageData }) {
  const movie = await data.hero;
  if (movie) return <Hero movie={movie} />;
  const source = await data.trending;
  return (
    <SectionState
      id="discover"
      title="Featured film unavailable"
      hero
      message={
        source.status === 'failure'
          ? 'The featured film is temporarily unavailable. Explore the other collections below.'
          : 'No featured film is available in this selection yet. Explore the collections below.'
      }
    />
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
  if (!result.data.length)
    return (
      <SectionState
        id={id}
        title={title}
        message={`No ${popular ? 'popular' : 'trending'} films are available in this selection yet.`}
      />
    );
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
    return (
      <SectionState
        id="genres"
        title="Browse by Genre"
        message="Genre browsing is temporarily unavailable. Explore the other collections above."
      />
    );
  return (
    <GenreBrowser
      movies={result.data}
      genres={result.choices}
      description={[
        !result.data.length
          ? 'No movie previews are available in this loaded Homepage selection.'
          : !result.choices.length
            ? 'Genre filters are unavailable for this selection. Browse the available film previews below.'
            : 'Filter this loaded Homepage selection, not the full TMDB catalog.',
        result.partial ? 'Some movie sources are unavailable.' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
