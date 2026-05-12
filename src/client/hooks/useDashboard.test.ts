import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboard } from './useDashboard';
import type { DashboardUsersResponse } from '../types/api';

const mockResponse: DashboardUsersResponse = {
  users: [
    { userId: 't2_u1', username: 'alice', activeStrikes: 2, totalStrikes: 2, isBanned: false, lastUpdated: '2026-01-01T00:00:00.000Z' },
  ],
  maxStrikes: 3,
};

// ─── basic state tests (real timers) ─────────────────────────────────────────

describe('useDashboard — state', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

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
      new Response('error', { status: 500 })
    );
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('500');
    expect(result.current.data).toBeNull();
  });
});

// ─── timer tests (fake setInterval only) ─────────────────────────────────────

describe('useDashboard — auto-refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('auto-refetches after 30 seconds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );
    renderHook(() => useDashboard());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(30_000); });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it('clears the interval on unmount — no further fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );
    const { unmount } = renderHook(() => useDashboard());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => { vi.advanceTimersByTime(90_000); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
