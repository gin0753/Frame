import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import { assetCredits } from '@/features/movies/data/asset-credits';
export function Footer() {
  return (
    <footer className="site-footer container-shell">
      <div className="footer-top">
        <a href="#discover" className="brand" aria-label="FRAME home">
          FRAME<span>.</span>
        </a>
        <p>
          For the love of the <em>frame.</em>
        </p>
        <a href="#credits" className="footer-credit-link">
          Image credits <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </div>
      <details id="credits" className="asset-credits">
        <summary>
          Imagery © Blender Foundation · Creative Commons Attribution
        </summary>
        <p>
          Film imagery © Blender Foundation, used under Creative Commons
          Attribution. Stills resized, compressed and cropped; poster-format
          artwork is a FRAME crop, not an official release poster. FRAME is an
          independent prototype with no Blender affiliation.
        </p>
        <ul>
          {assetCredits.map((credit) => (
            <li key={credit.title}>
              <a href={credit.source}>{credit.title}</a> —{' '}
              <a href={credit.policy}>{credit.license}</a>
            </li>
          ))}
        </ul>
        <p>
          See each project’s linked policy for its attribution and license
          terms.
        </p>
      </details>
      <div className="asset-credits text-sm" aria-label="TMDB credits">
        <a
          href="https://www.themoviedb.org"
          className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Image
            src="/images/brands/tmdb.svg"
            alt="TMDB — The Movie Database"
            width={42304}
            height={3540}
            className="h-auto w-30"
            unoptimized
          />
        </a>
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </div>
      <div className="footer-bottom">
        <span>© 2026 FRAME</span>
        <span>An independent eye on cinema.</span>
        <span>CURATED WITH INTENTION</span>
      </div>
    </footer>
  );
}
