import { navigateTo } from '@devvit/client';
import type { DashboardUserDetail } from '../types/api';
import { useUser } from '../hooks/useUser';
import { StrikeBar } from '../components/StrikeBar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import '../styles/user-detail.css';

export interface UserDetailProps {
  userId: string;
  username: string;
  onBack: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ud-section">
      <h2 className="ud-section__title">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="ud-empty">{message}</p>;
}

function UserSummary({ user, maxStrikes }: { user: DashboardUserDetail; maxStrikes: number }) {
  return (
    <div className="ud-summary">
      <h1 className="ud-summary__name">u/{user.username}</h1>
      <div className="ud-summary__row">
        <span className="ud-summary__badge">
          {user.activeStrikes}/{maxStrikes} active strikes
        </span>
        {user.isBanned && <span className="ud-summary__banned">⛔ Banned</span>}
      </div>
      <StrikeBar active={user.activeStrikes} max={maxStrikes} />
    </div>
  );
}

export function UserDetail({ userId, onBack }: UserDetailProps) {
  const { loading, error, data, reload } = useUser(userId);

  if (loading) return <LoadingSpinner />;
  if (error) return (
    <div>
      <button className="ud-back" onClick={onBack}>← Back</button>
      <ErrorMessage message={error} onRetry={reload} />
    </div>
  );
  if (!data) return null;

  const { user, maxStrikes } = data;

  return (
    <div className="user-detail">
      <button className="ud-back" onClick={onBack}>← Back</button>

      <UserSummary user={user} maxStrikes={maxStrikes} />

      <Section title="Strike history">
        {user.strikes.length === 0 ? (
          <EmptyState message="No strikes recorded." />
        ) : (
          <ul className="ud-list">
            {user.strikes.map((s, i) => (
              <li key={i} className="ud-list__item">
                <span className="ud-list__label">#{s.strikeNumber} — {s.ruleViolated}</span>
                <span className="ud-list__meta">{s.issuedAt.slice(0, 10)} · by u/{s.issuedBy}</span>
                {s.note && <span className="ud-list__note">{s.note}</span>}
                {s.postUrl && (
                  <button className="ud-list__link" onClick={() => navigateTo(s.postUrl)}>
                    View post →
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Resets">
        {user.resets.length === 0 ? (
          <EmptyState message="No resets recorded." />
        ) : (
          <ul className="ud-list">
            {user.resets.map((r, i) => (
              <li key={i} className="ud-list__item">
                <span className="ud-list__label">Reset by u/{r.resetBy}</span>
                <span className="ud-list__meta">{r.resetAt.slice(0, 10)} · {r.strikesAtReset} strike(s) cleared</span>
                {r.reason && <span className="ud-list__note">Reason: {r.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Removals">
        {user.removals.length === 0 ? (
          <EmptyState message="No removals recorded." />
        ) : (
          <ul className="ud-list">
            {user.removals.map((r, i) => (
              <li key={i} className="ud-list__item">
                <span className="ud-list__label">{r.ruleViolated}</span>
                <span className="ud-list__meta">{r.removedAt.slice(0, 10)} · by u/{r.removedBy}</span>
                {r.note && <span className="ud-list__note">{r.note}</span>}
                {r.contentUrl && (
                  <button className="ud-list__link" onClick={() => navigateTo(r.contentUrl)}>
                    View content →
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Mod notes">
        {user.modNotes.length === 0 ? (
          <EmptyState message="No mod notes." />
        ) : (
          <ul className="ud-list">
            {user.modNotes.map((n) => (
              <li key={n.id} className="ud-list__item">
                <span className="ud-list__label">{n.text}</span>
                <span className="ud-list__meta">{n.createdAt.slice(0, 10)} · by u/{n.author}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
