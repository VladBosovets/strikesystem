import type { DashboardUser } from '../types/api';
import { StrikeBar } from './StrikeBar';

export interface UserRowProps {
  user: DashboardUser;
  maxStrikes: number;
  onClick: (user: DashboardUser) => void;
}

export function UserRow({ user, maxStrikes, onClick }: UserRowProps) {
  return (
    <button
      className={`user-row${user.isBanned ? ' user-row--banned' : ''}`}
      onClick={() => onClick(user)}
    >
      <span className="user-row__name">u/{user.username}</span>
      <span className="user-row__strikes">{user.activeStrikes}/{maxStrikes}</span>
      <StrikeBar active={user.activeStrikes} max={maxStrikes} />
      {user.isBanned && <span className="user-row__banned-badge">⛔ Banned</span>}
    </button>
  );
}
