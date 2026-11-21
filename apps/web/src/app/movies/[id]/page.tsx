import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Search,
  Compass,
  Bookmark,
  CheckCircle2,
  Play,
  ArrowUpRight,
  UserRound,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { MovieArtwork } from '@/features/movies/components/movie-artwork';
import { artwork } from '@/features/movies/data/catalog-adapter';
import { movieImageFallbacks } from '@/features/movies/data/image-fallbacks';
import { formatRuntime } from '@/features/movies/presentation';
import { readDetail } from './detail-data';
import styles from './detail.module.css';

type Props = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await readDetail((await params).id);
  if (result.status !== 'success')
    return {
      title: 'Film unavailable — FRAME',
      robots: { index: false, follow: true },
    };
  return {
    title: `${result.movie.title} — FRAME`,
    description:
      result.movie.overview ?? `Discover ${result.movie.title} on FRAME.`,
  };
}

function Rail() {
  return (
    <nav className={styles.rail} aria-label="Film navigation">
      <Link href="/" aria-label="Home">
        <Home aria-hidden="true" />
      </Link>
      <a href="/search" aria-label="Search">
        <Search aria-hidden="true" />
      </a>
      <a href="/discover" aria-label="Discover">
        <Compass aria-hidden="true" />
      </a>
      <span className={styles.railGap} />
      <button
        type="button"
        disabled
        aria-label="Watchlist — coming soon"
        title="Watchlist — coming soon"
      >
        <Bookmark aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled
        aria-label="Watched — coming soon"
        title="Watched — coming soon"
      >
        <CheckCircle2 aria-hidden="true" />
      </button>
    </nav>
  );
}

export default async function MovieDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await readDetail(id);
  if (result.status === 'missing') notFound();
  if (result.status !== 'success')
    return (
      <>
        <Header context="detail" />
        <Rail />
        <main id="main" className={styles.state}>
          <p className={styles.eyebrow}>FRAME / FILM</p>
          <h1>
            {result.status === 'busy'
              ? 'This film is temporarily busy'
              : 'Film details are temporarily unavailable'}
          </h1>
          <p>Please try again shortly.</p>
          <form action={`/movies/${id}`} method="get">
            <button className={styles.action} type="submit">
              Try again
            </button>
          </form>
          <a href="/discover">Explore films</a>
        </main>
        <Footer homeHref="/" showAssetCredits={false} />
      </>
    );
  const m = result.movie;
  const runtime = formatRuntime(
    m.runtimeMinutes === null ? null : m.runtimeMinutes * 60,
  );
  const original =
    m.originalTitle && m.originalTitle !== m.title ? m.originalTitle : null;
  const rating =
    m.voteCount > 0 && m.voteAverage !== null
      ? `${m.voteAverage.toFixed(1)} / 10`
      : null;
  const facts = [
    ['Release date', m.releaseDate],
    ['Runtime', runtime],
    ['Genres', m.genres.map((g) => g.name).join(', ')],
    ['Original title', original],
    [
      'TMDB rating',
      rating
        ? `${rating} · ${m.voteCount.toLocaleString('en-US')} votes`
        : null,
    ],
    ['Countries', m.countries.map((c) => c.name).join(', ')],
    [
      'Languages',
      m.languages
        .map((l) => l.name)
        .filter(Boolean)
        .join(', '),
    ],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const backdrop = artwork(
    m.backdropUrl,
    'w1280',
    movieImageFallbacks.backdrop,
  );
  const poster = artwork(m.posterUrl, 'w500', movieImageFallbacks.poster);
  return (
    <>
      <Header context="detail" />
      <Rail />
      <main id="main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="film-title">
          <div className={styles.backdrop}>
            <MovieArtwork
              artwork={backdrop}
              sizes="100vw"
              preload
            />
          </div>
          <div className={styles.shade} />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>FRAME / FILM DETAILS</p>
            <h1 id="film-title">{m.title}</h1>
            {original && <p className={styles.original}>{original}</p>}
            <p className={styles.meta}>
              {[
                m.releaseDate?.slice(0, 4),
                runtime,
                m.genres.map((g) => g.name).join(' / '),
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
            {rating && (
              <p className={styles.rating}>
                <span aria-hidden="true">✦</span> TMDB rating{' '}
                <strong>{rating}</strong>{' '}
                <span>({m.voteCount.toLocaleString('en-US')} votes)</span>
              </p>
            )}
            {!rating && (
              <p className={styles.rating}>No TMDB rating available</p>
            )}
            {m.trailerUrl && (
              <a className={styles.action} href={m.trailerUrl}>
                <Play size={16} aria-hidden="true" /> Watch official trailer{' '}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </section>
        <div className={styles.content}>
          <div className={styles.intro}>
            <div className={styles.poster}>
              <MovieArtwork
                artwork={poster}
                sizes="(max-width: 767px) 38vw, 220px"
              />
            </div>
            <section className={styles.overview} aria-labelledby="overview">
              <p className={styles.eyebrow}>THE STORY</p>
              <h2 id="overview">Overview</h2>
              <p>
                {m.overview ?? 'An overview is not available for this film.'}
              </p>
            </section>
          </div>
          <div className={styles.columns}>
            <section aria-labelledby="facts">
              <p className={styles.eyebrow}>THE DETAILS</p>
              <h2 id="facts">About the film</h2>
              <dl className={styles.facts}>
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {m.directors.length > 0 && (
              <section aria-labelledby="directors">
                <p className={styles.eyebrow}>BEHIND THE FILM</p>
                <h2 id="directors">Directed by</h2>
                <ul className={styles.directors}>
                  {m.directors.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {m.cast.length > 0 && (
            <section className={styles.castSection} aria-labelledby="cast">
              <p className={styles.eyebrow}>THE PEOPLE</p>
              <h2 id="cast">Top cast</h2>
              <ul className={styles.cast}>
                {m.cast.map((p, i) => (
                  <li key={`${p.id}-${i}`}>
                    <span className={styles.portrait} aria-hidden="true">
                      {p.profileUrl &&
                      /^https:\/\/image\.tmdb\.org\/t\/p\/w185\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(
                        p.profileUrl,
                      ) ? (
                        <MovieArtwork
                          artwork={{
                            src: p.profileUrl,
                            width: 185,
                            height: 278,
                          }}
                          sizes="(max-width: 767px) 68px, (max-width: 1023px) 80px, 96px"
                        />
                      ) : (
                        <UserRound />
                      )}
                    </span>
                    <span className={styles.actor}>{p.name}</span>
                    {p.character && (
                      <span className={styles.character}>{p.character}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <a className={styles.source} href={m.attribution.sourceUrl}>
            View this film on TMDB <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </main>
      <Footer homeHref="/" showAssetCredits={false} />
    </>
  );
}
