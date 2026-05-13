import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUser } from './useUser';
import type { DashboardUserDetailResponse } from '../types/api';

const mockDetail: DashboardUserDetailResponse = {
  user: {
    userId: 't2_u1',
    username: 'alice',
    activeStrikes: 1,
    totalStrikes: 2,
    isBanned: false,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    strikes: [
      { strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' },
    ],
    resets: [
      { resetAt: '2026-02-01T00:00:00.000Z', resetBy: 'mod', reason: 'appeal', strikesAtReset: 1 },
    ],
    removals: [],
    modNotes: [
      { id: 'n1', text: 'watch this user', author: 'mod', createdAt: '2026-01-15T00:00:00.000Z' },
    ],
  },
  maxStrikes: 3,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useUser', () => {
  it('calls correct API endpoint with userId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDetail), { status: 200 })
    );
    renderHook(() => useUser('t2_u1'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard/user/t2_u1'));
  });

  it('returns user detail on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDetail), { status: 200 })
    );
    const { result } = renderHook(() => useUser('t2_u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.user.username).toBe('alice');
    expect(result.current.data?.user.strikes).toHaveLength(1);
    expect(result.current.data?.user.resets).toHaveLength(1);
    expect(result.current.data?.user.modNotes).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('returns error state on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );
    const { result } = renderHook(() => useUser('t2_nobody'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('not found');
    expect(result.current.data).toBeNull();
  });

  it('returns error state on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useUser('t2_u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
  });

  it('reload() triggers a new fetch without changing userId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockDetail), { status: 200 }));

    const { result } = renderHook(() => useUser('t2_u1'));
    await waitFor(() => expect(result.current.error).toBe('Network error'));

    act(() => { result.current.reload(); });

    await waitFor(() => expect(result.current.data?.user.username).toBe('alice'));
    expect(result.current.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
