import { useState } from 'react';
import type { ReactNode } from 'react';
import { navigateTo } from '@devvit/client';
import type { DashboardUserDetail, StrikeActionResponse, ResetActionResponse } from '../types/api';
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

type ActivePanel = 'strike' | 'reset' | 'note' | null;

function Section({ title, children }: { title: string; children: ReactNode }) {
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

function StrikePanel({
  rules, userId, onSuccess, onCancel, onReload,
}: { rules: string[]; userId: string; onSuccess: (msg: string) => void; onCancel: () => void; onReload?: () => void }) {
  const [rule, setRule] = useState(rules[0] ?? '');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/user/${encodeURIComponent(userId)}/strike`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule, note }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as StrikeActionResponse;
      const banned = data.wasBanned ? ' — user auto-banned.' : '.';
      const dm = data.dmFailed ? ' (DM not delivered)' : '';
      onSuccess(`Strike ${data.newTotal}/${data.maxStrikes} issued${banned}${dm}`);
    } catch (err) {
      onReload?.();
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div className="ud-panel">
      <span className="ud-panel__title">Issue Strike</span>
      <div>
        <label className="ud-panel__label">Rule violated</label>
        <select value={rule} onChange={(e) => setRule(e.target.value)}>
          {rules.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="ud-panel__label">Moderator note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context…" />
      </div>
      {error && <p className="ud-panel__feedback ud-panel__feedback--error">{error}</p>}
      <div className="ud-panel__row">
        <button className="ud-panel__cancel" onClick={onCancel}>Cancel</button>
        <button className="ud-panel__submit" onClick={submit} disabled={loading || !rule}>
          {loading ? 'Issuing…' : 'Issue Strike'}
        </button>
      </div>
    </div>
  );
}

function ResetPanel({
  userId, isBanned, onSuccess, onCancel, onReload,
}: { userId: string; isBanned: boolean; onSuccess: (msg: string) => void; onCancel: () => void; onReload?: () => void }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/user/${encodeURIComponent(userId)}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as ResetActionResponse;
      const unban = data.wasUnbanned
        ? ' User unbanned.'
        : data.unbanFailed
          ? ' ⚠️ Could not unban automatically — please unban manually.'
          : '';
      onSuccess(`${data.strikesCleared} strike(s) cleared.${unban}`);
    } catch (err) {
      onReload?.();
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div className="ud-panel">
      <span className="ud-panel__title">{isBanned ? 'Reset Strikes & Unban' : 'Reset Active Strikes'}</span>
      <div>
        <label className="ud-panel__label">Reason for reset</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Appeal approved, served time, etc." />
      </div>
      {error && <p className="ud-panel__feedback ud-panel__feedback--error">{error}</p>}
      <div className="ud-panel__row">
        <button className="ud-panel__cancel" onClick={onCancel}>Cancel</button>
        <button className="ud-panel__submit" onClick={submit} disabled={loading || !reason.trim()}>
          {loading ? 'Resetting…' : isBanned ? 'Reset & Unban' : 'Reset Active Strikes'}
        </button>
      </div>
    </div>
  );
}

function NotePanel({
  userId, onSuccess, onCancel,
}: { userId: string; onSuccess: (msg: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/user/${encodeURIComponent(userId)}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onSuccess('Mod note saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div className="ud-panel">
      <span className="ud-panel__title">Add Mod Note</span>
      <div>
        <label className="ud-panel__label">Note</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note visible only to mods…" />
      </div>
      {error && <p className="ud-panel__feedback ud-panel__feedback--error">{error}</p>}
      <div className="ud-panel__row">
        <button className="ud-panel__cancel" onClick={onCancel}>Cancel</button>
        <button className="ud-panel__submit" onClick={submit} disabled={loading || !note.trim()}>
          {loading ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}

export function UserDetail({ userId, onBack }: UserDetailProps) {
  const { loading, error, data, reload } = useUser(userId);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (loading && !data) return <LoadingSpinner />;
  if (error) return (
    <div>
      <button className="ud-back" onClick={onBack}>← Back</button>
      <ErrorMessage message={error} onRetry={reload} />
    </div>
  );
  if (!data) return null;

  const { user, maxStrikes, rules } = data;

  function handleActionSuccess(msg: string) {
    setActivePanel(null);
    setActionFeedback(msg);
    reload();
    setTimeout(() => setActionFeedback(null), 4000);
  }

  const canReset = user.activeStrikes > 0 || user.isBanned;

  return (
    <div className="user-detail">
      <button className="ud-back" onClick={onBack}>← Back</button>

      <UserSummary user={user} maxStrikes={maxStrikes} />

      <div className="ud-actions">
        {!user.isBanned && (
          <button
            className={`ud-action-btn${activePanel === 'strike' ? ' ud-action-btn--active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'strike' ? null : 'strike')}
          >
            Issue Strike
          </button>
        )}
        {canReset && (
          <button
            className={`ud-action-btn ud-action-btn--danger${activePanel === 'reset' ? ' ud-action-btn--active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'reset' ? null : 'reset')}
          >
            {user.isBanned ? 'Reset & Unban' : 'Reset Active Strikes'}
          </button>
        )}
        <button
          className={`ud-action-btn${activePanel === 'note' ? ' ud-action-btn--active' : ''}`}
          onClick={() => setActivePanel(activePanel === 'note' ? null : 'note')}
        >
          Add Mod Note
        </button>
      </div>

      {actionFeedback && (
        <p className="ud-panel__feedback ud-panel__feedback--success" style={{ marginBottom: 12 }}>
          {actionFeedback}
        </p>
      )}

      {activePanel === 'strike' && (
        <StrikePanel
          rules={rules}
          userId={userId}
          onSuccess={handleActionSuccess}
          onCancel={() => setActivePanel(null)}
          onReload={reload}
        />
      )}
      {activePanel === 'reset' && (
        <ResetPanel
          userId={userId}
          isBanned={user.isBanned}
          onSuccess={handleActionSuccess}
          onCancel={() => setActivePanel(null)}
          onReload={reload}
        />
      )}
      {activePanel === 'note' && (
        <NotePanel
          userId={userId}
          onSuccess={handleActionSuccess}
          onCancel={() => setActivePanel(null)}
        />
      )}

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
