import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ────────────────────────────────────────────────────────────────────

const { store, mockUser, mockContext } = vi.hoisted(() => {
  const mockUser = {
    getModPermissionsForSubreddit: vi.fn(async () => ['all']),
  };
  return {
    store: new Map<string, string>(),
    mockUser,
    mockContext: {
      userId: 't2_mod123' as string | undefined,
      username: 'testmod',
      subredditId: 't5_sub123',
      subredditName: 'testsubreddit',
    },
  };
});

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    expire: vi.fn(async () => {}),
    del: vi.fn(async (key: string) => { store.delete(key); }),
  },
  reddit: {
    getCurrentUser: vi.fn(async () => mockUser),
    getPostById: vi.fn(async () => ({
      authorId: 't2_target',
      permalink: '/r/testsubreddit/comments/xyz/test_post/',
    })),
    getCommentById: vi.fn(async () => ({
      authorId: 't2_target',
      permalink: '/r/testsubreddit/comments/xyz/test_post/abc/',
    })),
    getUserById: vi.fn(async () => ({
      username: 'targetuser',
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      linkKarma: 500,
      commentKarma: 500,
    })),
  },
  context: mockContext,
  settings: {
    get: vi.fn(async (key: string) => {
      if (key === 'maxStrikes') return 3;
      if (key === 'rules') return 'Rule 1\nRule 2\nRule 3';
      return undefined;
    }),
  },
}));

import { menu } from './menu';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SUB = 't5_sub123';
const TARGET_ID = 't2_target';

async function postMenu(path: string, targetId: string) {
  const res = await menu.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId }),
  });
  return res.json() as Promise<{
    showToast?: string;
    showForm?: { form: { title: string; fields: { name: string; defaultValue?: string }[] } };
  }>;
}

function strikeKey() { return `strikes:${SUB}:${TARGET_ID}`; }

function seedStrikeRecord(activeStrikes: number, totalStrikes = activeStrikes, isBanned = false) {
  store.set(strikeKey(), JSON.stringify({
    userId: TARGET_ID,
    username: 'targetuser',
    strikes: Array.from({ length: totalStrikes }, (_, i) => ({
      strikeNumber: i + 1,
      ruleViolated: 'Rule 1',
      note: '',
      issuedBy: 'testmod',
      issuedAt: '2026-01-01T00:00:00.000Z',
      postUrl: '',
    })),
    resets: activeStrikes < totalStrikes
      ? [{ resetAt: '2026-05-01T00:00:00.000Z', resetBy: 'testmod', reason: 'appeal', strikesAtReset: totalStrikes }]
      : [],
    removals: [],
    totalStrikes,
    activeStrikes,
    isBanned,
    lastUpdated: '2026-01-01T00:00:00.000Z',
  }));
}

beforeEach(() => {
  store.clear();
  mockUser.getModPermissionsForSubreddit.mockResolvedValue(['all']);
  mockContext.userId = 't2_mod123';
});

// ─── /warn-user ───────────────────────────────────────────────────────────────

describe('/warn-user (post)', () => {
  it('shows Warning 1/3 for a fresh user with no record', async () => {
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showForm?.form.title).toContain('Warning 1/3');
    expect(res.showForm?.form.title).not.toContain('AUTO-BAN');
  });

  it('uses activeStrikes not totalStrikes after a reset', async () => {
    // totalStrikes=2 (all-time) but activeStrikes=0 after reset
    seedStrikeRecord(0, 2);
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showForm?.form.title).toContain('Warning 1/3');
    expect(res.showForm?.form.title).not.toContain('AUTO-BAN');
  });

  it('shows AUTO-BAN warning when activeStrikes is at threshold', async () => {
    seedStrikeRecord(2);
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showForm?.form.title).toContain('AUTO-BAN');
    expect(res.showForm?.form.title).toContain('3/3');
  });

  it('does NOT show AUTO-BAN when totalStrikes is high but activeStrikes is low after reset', async () => {
    // User had 5 all-time strikes but was reset, now has 1 active
    seedStrikeRecord(1, 5);
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showForm?.form.title).not.toContain('AUTO-BAN');
    expect(res.showForm?.form.title).toContain('Warning 2/3');
  });

  it('history field shows active warning count not all-time count', async () => {
    seedStrikeRecord(0, 2);
    const res = await postMenu('/warn-user', 't3_xyz');
    const historyField = res.showForm?.form.fields.find((f) => f.name === 'history');
    expect(historyField?.defaultValue).toContain('No active warnings');
    expect(historyField?.defaultValue).not.toContain('Current warnings: 2');
  });

  it('returns already-banned toast when user is banned', async () => {
    seedStrikeRecord(3, 3, true);
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showToast).toContain('already banned');
    expect(res.showForm).toBeUndefined();
  });

  it('returns no-permission toast when mod lacks posts permission', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['wiki']);
    const res = await postMenu('/warn-user', 't3_xyz');
    expect(res.showToast).toContain('do not have mod permissions');
  });

  it('works for comment targets (t1_) as well as posts', async () => {
    const res = await postMenu('/warn-user', 't1_abc');
    expect(res.showForm?.form.title).toContain('Warning 1/3');
  });
});
