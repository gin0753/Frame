import styles from './detail.module.css';
export default function Loading() {
  return (
    <main
      id="main"
      className={styles.loading}
      aria-busy="true"
      aria-label="Loading film details"
    >
      <p role="status">Bringing the film into focus…</p>
      <div className={styles.loadingHero} />
      <div className={styles.loadingPoster} />
    </main>
  );
}
