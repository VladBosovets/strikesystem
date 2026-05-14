import { useState, useEffect } from 'react';
import type { DashboardUser } from './types/api';
import { Overview } from './views/Overview';
import { UserDetail } from './views/UserDetail';
import { useDashboard } from './hooks/useDashboard';
import './styles/global.css';

type View =
  | { name: 'overview' }
  | { name: 'user-detail'; userId: string; username: string };

// window.devvit is injected by the Devvit CDN in production
declare global {
  interface Window {
    devvit?: { context?: { subredditName?: string } };
  }
}

export function App() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const { loading, error, forbidden, data, reload } = useDashboard();

  useEffect(() => {
    const sub = window.devvit?.context?.subredditName;
    if (sub) document.title = `Mod Dashboard — r/${sub}`;
  }, []);

  function handleSelectUser(user: DashboardUser) {
    setView({ name: 'user-detail', userId: user.userId, username: user.username });
  }

  if (forbidden) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>This dashboard is for moderators only.</p>
      </div>
    );
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
