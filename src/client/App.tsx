import { useState } from 'react';
import type { DashboardUser } from './types/api';
import { Overview } from './views/Overview';
import { UserDetail } from './views/UserDetail';
import { useDashboard } from './hooks/useDashboard';
import './styles/global.css';

type View =
  | { name: 'overview' }
  | { name: 'user-detail'; userId: string; username: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const { loading, error, data, reload } = useDashboard();

  function handleSelectUser(user: DashboardUser) {
    setView({ name: 'user-detail', userId: user.userId, username: user.username });
  }

  if (view.name === 'overview') {
    return (
      <Overview
        loading={loading}
        error={error}
        data={data}
        onSelectUser={handleSelectUser}
        onRetry={reload}
      />
    );
  }

  return (
    <UserDetail
      userId={view.userId}
      username={view.username}
      onBack={() => setView({ name: 'overview' })}
    />
  );
}
