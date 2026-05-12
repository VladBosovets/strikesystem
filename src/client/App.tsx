import { useState } from 'react';
import type { DashboardUser } from './types/api';
import { Overview } from './views/Overview';
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

  // user-detail view will be built in step 5
  return (
    <div>
      <button onClick={() => setView({ name: 'overview' })}>← Back</button>
      <p>Loading user {view.username}…</p>
    </div>
  );
}
