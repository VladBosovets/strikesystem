import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboard } from './useDashboard';
import type { DashboardUsersResponse } from '../types/api';

const mockResponse: DashboardUsersResponse = {
  users: [
    { userId: 't2_u1', username: 'alice', activeStrikes: 2, totalStrikes: 2, isBanned: false, lastUpdated: '2026-01-01T00:00:00.000Z' },
  ],
  maxStrikes: 3,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useDashboard', () => {
  it('returns loading true initially', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );
    const { result } = renderHook(() => useDashboard());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('calls the correct API endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );
    renderHook(() => useDashboard());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard/users'));
  });

  it('returns users and maxStrikes on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.users).toHaveLength(1);
    expect(result.current.data?.maxStrikes).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('returns error state on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('returns error state on non-ok HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal server error', { status: 500 })
    );
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('500');
    expect(result.current.data).toBeNull();
  });
});
