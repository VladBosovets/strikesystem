import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserDetail } from './UserDetail';
import type { DashboardUserDetailResponse } from '../types/api';

const mockNavigateTo = vi.hoisted(() => vi.fn());
vi.mock('@devvit/client', () => ({ navigateTo: mockNavigateTo }));

const mockDetail: DashboardUserDetailResponse = {
  user: {
    userId: 't2_u1',
    username: 'alice',
    activeStrikes: 1,
    totalStrikes: 2,
    isBanned: false,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    strikes: [
      { strikeNumber: 1, ruleViolated: 'Rule 1', note: 'bad post', issuedBy: 'testmod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' },
    ],
    resets: [
      { resetAt: '2026-02-01T00:00:00.000Z', resetBy: 'testmod', reason: 'appeal approved', strikesAtReset: 1 },
    ],
    removals: [
      { contentId: 't3_x', contentUrl: 'https://reddit.com/r/x', ruleViolated: 'Rule 2', note: '', removedBy: 'testmod', removedAt: '2026-01-05T00:00:00.000Z' },
    ],
    modNotes: [
      { id: 'n1', text: 'watch this user', author: 'testmod', createdAt: '2026-01-15T00:00:00.000Z' },
    ],
  },
  maxStrikes: 3,
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigateTo.mockClear();
});

function renderDetail(onBack = vi.fn()) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(mockDetail), { status: 200 })
  );
  return render(<UserDetail userId="t2_u1" username="alice" onBack={onBack} />);
}

describe('UserDetail', () => {
  it('renders username and strike count after loading', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('u/alice')).toBeDefined());
    expect(screen.getByText('1/3 active strikes')).toBeDefined();
  });

  it('shows strike history section with strikes', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Strike history'));
    expect(screen.getByText('#1 — Rule 1')).toBeDefined();
    expect(screen.getByText(/bad post/)).toBeDefined();
  });

  it('shows resets section', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Resets'));
    expect(screen.getByText(/Reset by u\/testmod/)).toBeDefined();
    expect(screen.getByText(/appeal approved/)).toBeDefined();
  });

  it('shows removals section', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Removals'));
    expect(screen.getByText('Rule 2')).toBeDefined();
  });

  it('shows mod notes section', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Mod notes'));
    expect(screen.getByText('watch this user')).toBeDefined();
  });

  it('shows empty state messages when sections are empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        ...mockDetail,
        user: { ...mockDetail.user, strikes: [], resets: [], removals: [], modNotes: [] },
      }), { status: 200 })
    );
    render(<UserDetail userId="t2_u1" username="alice" onBack={vi.fn()} />);
    await waitFor(() => screen.getByText('u/alice'));
    expect(screen.getByText('No strikes recorded.')).toBeDefined();
    expect(screen.getByText('No resets recorded.')).toBeDefined();
    expect(screen.getByText('No removals recorded.')).toBeDefined();
    expect(screen.getByText('No mod notes.')).toBeDefined();
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    renderDetail(onBack);
    await waitFor(() => screen.getByText('u/alice'));
    await userEvent.click(screen.getByText('← Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows a button to the offending post when postUrl is set, and navigateTo is called on click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        ...mockDetail,
        user: {
          ...mockDetail.user,
          strikes: [{ ...mockDetail.user.strikes[0], postUrl: 'https://reddit.com/r/test/comments/abc' }],
        },
      }), { status: 200 })
    );
    render(<UserDetail userId="t2_u1" username="alice" onBack={vi.fn()} />);
    await waitFor(() => screen.getByText('u/alice'));
    const btn = screen.getByRole('button', { name: 'View post →' });
    await userEvent.click(btn);
    expect(mockNavigateTo).toHaveBeenCalledWith('https://reddit.com/r/test/comments/abc');
  });

  it('does not show post button when postUrl is empty', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('u/alice'));
    expect(screen.queryByRole('button', { name: 'View post →' })).toBeNull();
  });

  it('shows a button for removed content and navigateTo is called on click', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('u/alice'));
    const btn = screen.getByRole('button', { name: 'View content →' });
    await userEvent.click(btn);
    expect(mockNavigateTo).toHaveBeenCalledWith('https://reddit.com/r/x');
  });
});
