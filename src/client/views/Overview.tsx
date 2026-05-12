import { useState } from 'react';
import type { DashboardUser, DashboardUsersResponse } from '../types/api';
import { UserRow } from '../components/UserRow';
import { SkeletonList } from '../components/SkeletonList';
import { ErrorMessage } from '../components/ErrorMessage';
import '../styles/overview.css';
import '../styles/components.css';

export interface OverviewProps {
  loading: boolean;
  error: string | null;
  data: DashboardUsersResponse | null;
  onSelectUser: (user: DashboardUser) => void;
  onRetry: () => void;
}

export function Overview({ loading, error, data, onSelectUser, onRetry }: OverviewProps) {
  const [filter, setFilter] = useState('');

  if (loading && !data) return <SkeletonList />;
  if (error) return <ErrorMessage message={error} onRetry={onRetry} />;
  if (!data) return null;

  const { users, maxStrikes } = data;
  const activeCount = users.filter((u) => u.activeStrikes > 0 && !u.isBanned).length;
  const bannedCount = users.filter((u) => u.isBanned).length;

  const filterLower = filter.toLowerCase();
  const visible = filterLower
    ? users.filter((u) => u.username.toLowerCase().includes(filterLower))
    : users;

  return (
    <div className="overview">
      <header className="overview-header">
        <h1 className="overview-header__title">Mod Dashboard</h1>
        <p className="overview-header__stats">
          {activeCount} active warning{activeCount !== 1 ? 's' : ''} · {bannedCount} banned
          {loading && <span className="overview-header__refreshing"> · refreshing…</span>}
        </p>
      </header>

      {users.length === 0 ? (
        <p className="overview-empty">No warned users on record.</p>
      ) : (
        <>
          <input
            className="overview-filter"
            type="text"
            placeholder="Search by username…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter users by username"
          />
          {visible.length === 0 ? (
            <p className="overview-empty">No users match your search.</p>
          ) : (
            <ul className="overview-user-list">
              {visible.map((user) => (
                <li key={user.userId}>
                  <UserRow user={user} maxStrikes={maxStrikes} onClick={onSelectUser} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
