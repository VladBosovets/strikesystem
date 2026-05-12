import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Overview } from './Overview';
import type { DashboardUsersResponse } from '../types/api';

const makeUser = (username: string, activeStrikes = 1, isBanned = false) => ({
  userId: `t2_${username}`,
  username,
  activeStrikes,
  totalStrikes: activeStrikes,
  isBanned,
  lastUpdated: '2026-01-01T00:00:00.000Z',
});

const twoUsers: DashboardUsersResponse = {
  users: [makeUser('alice', 2), makeUser('bob', 1)],
  maxStrikes: 3,
};

function renderOverview(data: DashboardUsersResponse | null = twoUsers) {
  return render(
    <Overview loading={false} error={null} data={data} onSelectUser={vi.fn()} onRetry={vi.fn()} />
  );
}

describe('Overview — username filter', () => {
  it('shows the search input when users exist', () => {
    renderOverview();
    expect(screen.getByPlaceholderText('Search by username…')).toBeDefined();
  });

  it('does not show the search input when the user list is empty', () => {
    renderOverview({ users: [], maxStrikes: 3 });
    expect(screen.queryByPlaceholderText('Search by username…')).toBeNull();
  });

  it('filters users by username (case-insensitive)', async () => {
    renderOverview();
    const input = screen.getByPlaceholderText('Search by username…');
    await userEvent.type(input, 'ali');
    expect(screen.getByText('u/alice')).toBeDefined();
    expect(screen.queryByText('u/bob')).toBeNull();
  });

  it('shows all users when filter is cleared', async () => {
    renderOverview();
    const input = screen.getByPlaceholderText('Search by username…');
    await userEvent.type(input, 'alice');
    await userEvent.clear(input);
    expect(screen.getByText('u/alice')).toBeDefined();
    expect(screen.getByText('u/bob')).toBeDefined();
  });

  it('shows "No users match" message when no usernames match', async () => {
    renderOverview();
    const input = screen.getByPlaceholderText('Search by username…');
    await userEvent.type(input, 'zzznomatch');
    expect(screen.getByText('No users match your search.')).toBeDefined();
  });
});

describe('Overview — stats header', () => {
  it('shows active and banned counts', () => {
    renderOverview({
      users: [makeUser('alice', 2), makeUser('banned', 0, true)],
      maxStrikes: 3,
    });
    expect(screen.getByText(/1 active warning/)).toBeDefined();
    expect(screen.getByText(/1 banned/)).toBeDefined();
  });

  it('shows empty state when no users', () => {
    renderOverview({ users: [], maxStrikes: 3 });
    expect(screen.getByText('No warned users on record.')).toBeDefined();
  });
});
