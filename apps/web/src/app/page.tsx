import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Hero } from '@/features/movies/components/hero';
import { MovieRail } from '@/features/movies/components/movie-rail';
import { GenreBrowser } from '@/features/movies/components/genre-browser';
import { fixtureMovieSource } from '@/features/movies/data/fixtures';
export default async function Home() {
  const movies = await fixtureMovieSource.listPreviews();
  const featured = movies.find((movie) => movie.id === 'charge');
  const popular = [...movies.slice(2), ...movies.slice(0, 2)];
  const acclaimed = movies.filter((movie) => movie.recognition).reverse();
  return (
    <>
      <Header />
      <main id="main">
        {featured && <Hero movie={featured} />}
        <div className="discovery-content">
          <MovieRail
            id="trending"
            title="Trending Now"
            eyebrow="THE DISCOVERY EDIT"
            description="A curated selection from the open-film archive."
            movies={movies}
          />
          <MovieRail
            id="films"
            title="Popular Films"
            eyebrow="WORTH YOUR TIME"
            description="Curated favourites, not a live popularity ranking."
            movies={popular}
            variant="poster"
          />
          <section
            id="collections"
            className="collection-section container-shell"
            aria-labelledby="collection-heading"
          >
            <div className="collection-art">
              <Image
                src="/images/films/spring-backdrop.webp"
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 70vw"
              />
              <div className="collection-shade" />
            </div>
            <div className="collection-copy">
              <p className="eyebrow">THE FRAME COLLECTION / 01</p>
              <h2 id="collection-heading">
                Small films.
                <br />
                <em>Limitless worlds.</em>
              </h2>
              <p>
                Step beyond the familiar. Discover independent stories where
                imagination has no ceiling.
              </p>
              <Button variant="secondary" className="rounded-md" asChild>
                <a href="#genres">
                  Find your world{' '}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
            <span className="collection-credit">
              SPRING · BLENDER FOUNDATION
            </span>
          </section>
          <MovieRail
            id="acclaimed"
            title="Critically Acclaimed"
            eyebrow="FESTIVAL SPOTLIGHT"
            description="An award winner and festival selections, with recognition sources."
            movies={acclaimed}
            recognition
          />
          <GenreBrowser movies={movies} />
        </div>
      </main>
      <Footer />
    </>
  );
}
