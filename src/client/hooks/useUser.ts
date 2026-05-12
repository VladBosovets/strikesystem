import { useState, useEffect } from 'react';
import type { DashboardUserDetailResponse } from '../types/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: DashboardUserDetailResponse };

export function useUser(userId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        const res = await fetch(`/api/dashboard/user/${encodeURIComponent(userId)}`);
        if (!res.ok) {
          const msg = res.status === 404 ? 'User not found' : `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const data = (await res.json()) as DashboardUserDetailResponse;
        if (!cancelled) setState({ status: 'success', data });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [userId]);

  return {
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    data: state.status === 'success' ? state.data : null,
  };
}
