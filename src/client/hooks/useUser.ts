import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL_MS = 30_000;
import type { DashboardUserDetailResponse } from '../types/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: DashboardUserDetailResponse };

export function useUser(userId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const seqRef = useRef(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const seq = ++seqRef.current;

    async function load() {
      setState((s) => s.status === 'success' ? s : { status: 'loading' });
      try {
        const res = await fetch(`/api/dashboard/user/${encodeURIComponent(userId)}`);
        if (!res.ok) {
          const msg = res.status === 404 ? 'User not found' : `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const data = (await res.json()) as DashboardUserDetailResponse;
        if (seq === seqRef.current) setState({ status: 'success', data });
      } catch (err) {
        if (seq === seqRef.current) setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    void load();
    const id = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(id);
      seqRef.current++;
    };
  }, [userId, reloadKey]);

  return {
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    data: state.status === 'success' ? state.data : null,
    reload,
  };
}
