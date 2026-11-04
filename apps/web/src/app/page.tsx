import Image from 'next/image';
import { Suspense } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { MovieRail } from '@/features/movies/components/movie-rail';
import {
  HomepageHero,
  HomepageRail,
  HomepageGenres,
  SectionState,
} from '@/features/movies/components/homepage-sections';
import { createHomepageData } from '@/features/movies/data/homepage';
import { movieFixtures } from '@/features/movies/data/fixtures';
// Even an unavailable build-time API must not freeze an outage into the Homepage.
export const dynamic = 'force-dynamic';
export default async function Home() {
  const data = createHomepageData();
  const acclaimed = movieFixtures
    .filter((movie) => 'recognition' in movie)
    .reverse();
  return (
    <>
      <Header />
      <main id="main">
        <Suspense
          fallback={
            <SectionState id="discover" title="Featured film" hero loading />
          }
        >
          <HomepageHero data={data} />
        </Suspense>
        <div className="discovery-content">
          <Suspense
            fallback={
              <SectionState id="trending" title="Trending Now" loading />
            }
          >
            <HomepageRail data={data} />
          </Suspense>
          <Suspense
            fallback={<SectionState id="films" title="Popular Films" loading />}
          >
            <HomepageRail data={data} popular />
          </Suspense>
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
            title="Festival & Award Recognition"
            eyebrow="FESTIVAL SPOTLIGHT"
            description="Blender open films: an award winner and festival selections, with recognition sources."
            movies={acclaimed}
            recognition
          />
          <Suspense
            fallback={
              <SectionState id="genres" title="Browse by Genre" loading />
            }
          >
            <HomepageGenres data={data} />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
