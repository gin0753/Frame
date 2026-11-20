import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import Link from 'next/link';
import { Home, Search, Compass } from 'lucide-react';
import styles from './detail.module.css';
export default function NotFound() {
  return (
    <>
      <Header context="detail" />
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
      </nav>
      <main id="main" className={styles.state}>
        <p className={styles.eyebrow}>FRAME / FILM</p>
        <h1>Film not found</h1>
        <p>We couldn’t find this film.</p>
        <a href="/discover">Explore films</a>
      </main>
      <Footer homeHref="/" showAssetCredits={false} />
    </>
  );
}
