import { useState, useEffect, useCallback } from 'react';
import type { DashboardUsersResponse } from '../types/api';

const REFRESH_INTERVAL_MS = 30_000;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: DashboardUsersResponse };

export function useDashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/dashboard/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DashboardUsersResponse;
      setState({ status: 'success', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => { clearInterval(id); };
  }, [load]);

  return {
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    data: state.status === 'success' ? state.data : null,
    reload: load,
  };
}
