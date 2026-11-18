import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './ambient-playground.module.css';
import { AmbientGallery } from './ambient-gallery';

export default function AmbientIndex() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <main id="main" className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/">FRAME home</Link>
      </nav>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>FRAME / DEVELOPMENT ONLY / 4.6.1C</p>
        <h1>A study in atmosphere.</h1>
        <p>
          A development gallery of ambient backgrounds and content experiments.
          Compare the studies before choosing a direction.
        </p>
      </header>
      <AmbientGallery />
      <p className={styles.notes}>
        Development-only experiments. No effect is integrated into production
        pages. Visual selection awaits review.
      </p>
    </main>
  );
}
