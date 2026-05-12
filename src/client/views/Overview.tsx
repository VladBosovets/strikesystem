import type { DashboardUser, DashboardUsersResponse } from '../types/api';
import '../styles/overview.css';
import '../styles/components.css';
import { UserRow } from '../components/UserRow';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export interface OverviewProps {
  loading: boolean;
  error: string | null;
  data: DashboardUsersResponse | null;
  onSelectUser: (user: DashboardUser) => void;
  onRetry: () => void;
}

export function Overview({ loading, error, data, onSelectUser, onRetry }: OverviewProps) {
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={onRetry} />;
  if (!data) return null;

  const { users, maxStrikes } = data;
  const activeCount = users.filter((u) => u.activeStrikes > 0 && !u.isBanned).length;
  const bannedCount = users.filter((u) => u.isBanned).length;

  return (
    <div className="overview">
      <header className="overview-header">
        <h1 className="overview-header__title">Mod Dashboard</h1>
        <p className="overview-header__stats">
          {activeCount} active warning{activeCount !== 1 ? 's' : ''} · {bannedCount} banned
        </p>
      </header>

      {users.length === 0 ? (
        <p className="overview-empty">No warned users on record.</p>
      ) : (
        <ul className="overview-user-list">
          {users.map((user) => (
            <li key={user.userId}>
              <UserRow user={user} maxStrikes={maxStrikes} onClick={onSelectUser} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
