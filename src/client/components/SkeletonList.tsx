export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-row__name skeleton-pulse" />
          <div className="skeleton-row__bar skeleton-pulse" />
        </div>
      ))}
    </div>
  );
}
