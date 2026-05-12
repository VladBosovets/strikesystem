import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ────────────────────────────────────────────────────────────────────

const { store, mockUser, mockReddit, mockContext, mockZRange } = vi.hoisted(() => {
  const mockUser = {
    getModPermissionsForSubreddit: vi.fn(async () => ['all']),
  };
  const mockZRange = vi.fn(async () => [] as { member: string; score: number }[]);
  const mockReddit = {
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
    submitCustomPost: vi.fn(async () => ({
      url: 'https://www.reddit.com/r/testsubreddit/comments/abc123/mod_dashboard/',
    })),
  };
  return {
    store: new Map<string, string>(),
    mockUser,
    mockReddit,
    mockContext: {
      userId: 't2_mod123' as string | undefined,
      username: 'testmod',
      subredditId: 't5_sub123',
      subredditName: 'testsubreddit',
    },
    mockZRange,
  };
});

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    expire: vi.fn(async () => {}),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    zAdd: vi.fn(async () => 0),
    zRange: mockZRange,
  },
  reddit: mockReddit,
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
  mockZRange.mockResolvedValue([]);
  mockContext.userId = 't2_mod123';
  mockReddit.getCurrentUser.mockResolvedValue(mockUser);
  mockReddit.submitCustomPost.mockClear();
  mockReddit.submitCustomPost.mockResolvedValue({
    url: 'https://www.reddit.com/r/testsubreddit/comments/abc123/mod_dashboard/',
  });
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

// ─── /view-all-warnings ───────────────────────────────────────────────────────

function seedStrikeForUser(userId: string, username: string, activeStrikes: number, isBanned = false) {
  store.set(`strikes:${SUB}:${userId}`, JSON.stringify({
    userId, username,
    strikes: Array.from({ length: activeStrikes }, (_, i) => ({
      strikeNumber: i + 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod',
      issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '',
    })),
    resets: [], removals: [],
    totalStrikes: activeStrikes, activeStrikes, isBanned,
    lastUpdated: '2026-01-01T00:00:00.000Z',
  }));
}

describe('/view-all-warnings', () => {
  async function getWarnings() {
    const res = await menu.request('/view-all-warnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.json() as Promise<{
      showToast?: string;
      showForm?: { form: { title: string; fields: { name: string; defaultValue?: string }[] } };
    }>;
  }

  it('returns toast when no users have been warned', async () => {
    const res = await getWarnings();
    expect(res.showToast).toBe('No warned users on record.');
  });

  it('returns no-permission toast when mod lacks permissions', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['wiki']);
    const res = await getWarnings();
    expect(res.showToast).toContain('do not have mod permissions');
  });

  it('shows active warned users in the display', async () => {
    mockZRange.mockResolvedValue([{ member: 't2_user1', score: 1 }]);
    seedStrikeForUser('t2_user1', 'warneduser', 2);
    const res = await getWarnings();
    const field = res.showForm?.form.fields[0];
    expect(field?.defaultValue).toContain('warneduser');
    expect(field?.defaultValue).toContain('2/3');
  });

  it('shows banned users separately', async () => {
    mockZRange.mockResolvedValue([{ member: 't2_user1', score: 1 }]);
    seedStrikeForUser('t2_user1', 'banneduser', 3, true);
    const res = await getWarnings();
    const field = res.showForm?.form.fields[0];
    expect(field?.defaultValue).toContain('BANNED');
    expect(field?.defaultValue).toContain('banneduser');
  });

  it('shows cleared users in a separate section', async () => {
    mockZRange.mockResolvedValue([{ member: 't2_user1', score: 1 }]);
    seedStrikeForUser('t2_user1', 'cleareduser', 0);
    const res = await getWarnings();
    const field = res.showForm?.form.fields[0];
    expect(field?.defaultValue).toContain('cleareduser');
    expect(field?.defaultValue).toContain('Cleared');
  });

  it('summary label shows total active count', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_user1', score: 2 },
      { member: 't2_user2', score: 1 },
    ]);
    seedStrikeForUser('t2_user1', 'user1', 1);
    seedStrikeForUser('t2_user2', 'user2', 2);
    const res = await getWarnings();
    expect(res.showForm?.form.fields[0].name).toBe('summary');
    expect(res.showForm?.form.title).toContain('testsubreddit');
  });

  it('banned user with active strikes appears only in banned section, not double-counted', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_active', score: 1 },
      { member: 't2_banned', score: 2 },
    ]);
    seedStrikeForUser('t2_active', 'activeuser', 1, false);
    seedStrikeForUser('t2_banned', 'banneduser', 2, true);

    const res = await getWarnings();
    const label = (res.showForm?.form.fields[0] as { label?: string })?.label ?? '';
    // totalActive should be 2 (1 active non-banned + 1 banned), not 3
    expect(label).toBe('2 user(s) with active warnings');
    const text = res.showForm?.form.fields[0].defaultValue ?? '';
    // banneduser should appear only in Banned section, not in Active warnings
    const activeSection = text.split('\n\n')[0] ?? '';
    expect(activeSection).not.toContain('banneduser');
  });
});

// ─── /create-dashboard-post ───────────────────────────────────────────────────

describe('/create-dashboard-post', () => {
  async function createDashboard() {
    const res = await menu.request('/create-dashboard-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.json() as Promise<{ showToast?: string; navigateTo?: string }>;
  }

  it('returns no-permission toast when mod lacks permissions', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['wiki']);
    const res = await createDashboard();
    expect(res.showToast).toContain('do not have mod permissions');
    expect(res.navigateTo).toBeUndefined();
  });

  it('calls submitCustomPost with correct subredditName and default entry', async () => {
    await createDashboard();
    expect(mockReddit.submitCustomPost).toHaveBeenCalledWith(
      expect.objectContaining({
        subredditName: 'testsubreddit',
        entry: 'default',
      })
    );
  });

  it('returns navigateTo URL pointing to the created post', async () => {
    const res = await createDashboard();
    expect(res.navigateTo).toBe(
      'https://www.reddit.com/r/testsubreddit/comments/abc123/mod_dashboard/'
    );
    expect(res.showToast).toBeUndefined();
  });

  it('uses the correct post title', async () => {
    await createDashboard();
    expect(mockReddit.submitCustomPost).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mod Dashboard — Strike System' })
    );
  });

  it('saves the post URL to Redis after creating', async () => {
    await createDashboard();
    const stored = store.get(`dashboard-post:${SUB}`);
    expect(stored).toBe('https://www.reddit.com/r/testsubreddit/comments/abc123/mod_dashboard/');
  });

  it('navigates to existing post URL without creating a new post', async () => {
    store.set(`dashboard-post:${SUB}`, 'https://www.reddit.com/r/testsubreddit/comments/existing123/mod_dashboard/');
    const res = await createDashboard();
    expect(mockReddit.submitCustomPost).not.toHaveBeenCalled();
    expect(res.navigateTo).toBe('https://www.reddit.com/r/testsubreddit/comments/existing123/mod_dashboard/');
  });

  it('creates a new post when no URL is stored', async () => {
    const res = await createDashboard();
    expect(mockReddit.submitCustomPost).toHaveBeenCalledTimes(1);
    expect(res.navigateTo).toBe('https://www.reddit.com/r/testsubreddit/comments/abc123/mod_dashboard/');
  });
});
