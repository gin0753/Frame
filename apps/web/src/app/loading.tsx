export default function Loading() {
  return (
    <main
      className="loading-page container-shell"
      aria-busy="true"
      aria-label="Loading film selections"
    >
      <span className="brand">FRAME.</span>
      <p role="status" className="eyebrow mt-10">
        BRINGING THE PICTURE INTO FOCUS
      </p>
      <div className="loading-hero skeleton" />
      <div className="loading-cards">
        {[0, 1, 2].map((n) => (
          <div key={n} className="skeleton aspect-video rounded" />
        ))}
      </div>
    </main>
  );
}
