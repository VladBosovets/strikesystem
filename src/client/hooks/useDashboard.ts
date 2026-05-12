import { useState, useEffect, useCallback } from 'react';
import type { DashboardUsersResponse } from '../types/api';

const REFRESH_INTERVAL_MS = 30_000;

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardUsersResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as DashboardUsersResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => { clearInterval(id); };
  }, [load]);

  return { loading, error, data, reload: load };
}
