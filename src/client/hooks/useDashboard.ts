import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashboardUsersResponse } from '../types/api';

const REFRESH_INTERVAL_MS = 30_000;

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState<DashboardUsersResponse | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/users');
      if (res.status === 403) {
        if (seq === seqRef.current) setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DashboardUsersResponse;
      if (seq === seqRef.current) setData(json);
    } catch (err) {
      if (seq === seqRef.current) setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(id);
      seqRef.current++;
    };
  }, [load]);

  return { loading, error, forbidden, data, reload: load };
}
