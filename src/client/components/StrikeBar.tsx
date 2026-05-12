export interface StrikeBarProps {
  active: number;
  max: number;
}

export function StrikeBar({ active, max }: StrikeBarProps) {
  const filled = Math.min(active, max);
  const empty = Math.max(0, max - filled);
  return (
    <span className="strike-bar" aria-label={`${active} of ${max} strikes`}>
      <span className="strike-bar__filled">{'█'.repeat(filled)}</span>
      <span className="strike-bar__empty">{'░'.repeat(empty)}</span>
    </span>
  );
}
