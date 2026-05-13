import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ────────────────────────────────────────────────────────────────────

const { store, mockZRange, mockContext } = vi.hoisted(() => {
  const mockZRange = vi.fn(async () => [] as { member: string; score: number }[]);
  return {
    store: new Map<string, string>(),
    mockZRange,
    mockContext: {
      subredditId: 't5_sub123' as string,
      subredditName: 'testsubreddit',
    },
  };
});

vi.mock('@devvit/web/server', () => ({
  context: mockContext,
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    zAdd: vi.fn(async () => 0),
    zRange: mockZRange,
    zRem: vi.fn(async () => 0),
  },
}));

import { triggers } from './triggers';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SUB = 't5_sub123';

function dashboardKey() { return `dashboard-post:${SUB}`; }
function strikeKey(userId: string) { return `strikes:${SUB}:${userId}`; }
function warnedKey() { return `warned-index:${SUB}`; }

function seedDashboardPost(id: string, url: string) {
  store.set(dashboardKey(), JSON.stringify({ id, url }));
}

function seedUserRecord(userId: string, opts: {
  strikes?: { postUrl: string }[];
  removals?: { contentId: string; contentUrl: string; ruleViolated: string; note: string; removedBy: string; removedAt: string }[];
} = {}) {
  store.set(strikeKey(userId), JSON.stringify({
    userId,
    username: 'testuser',
    strikes: opts.strikes ?? [],
    resets: [],
    removals: opts.removals ?? [],
    totalStrikes: opts.strikes?.length ?? 0,
    activeStrikes: opts.strikes?.length ?? 0,
    isBanned: false,
    lastUpdated: new Date().toISOString(),
  }));
  mockZRange.mockResolvedValueOnce([{ member: userId, score: opts.strikes?.length ?? 0 }]);
}

async function postTrigger(path: string, body: object) {
  return triggers.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  store.clear();
  mockZRange.mockReset();
  mockZRange.mockResolvedValue([]);
});

// ─── /on-post-delete ──────────────────────────────────────────────────────────

describe('/on-post-delete', () => {
  it('clears the dashboard post key when the deleted post matches the stored id', async () => {
    seedDashboardPost('t3_abc123', 'https://reddit.com/r/testsubreddit/comments/abc123/');
    const res = await postTrigger('/on-post-delete', {
      postId: 't3_abc123',
      subreddit: { name: 'testsubreddit' },
    });
    expect(res.status).toBe(200);
    expect(store.has(dashboardKey())).toBe(false);
  });

  it('does not clear the key when the deleted post is a different post', async () => {
    seedDashboardPost('t3_abc123', 'https://reddit.com/r/testsubreddit/comments/abc123/');
    await postTrigger('/on-post-delete', {
      postId: 't3_other999',
      subreddit: { name: 'testsubreddit' },
    });
    expect(store.has(dashboardKey())).toBe(true);
  });

  it('does not error when no dashboard post is stored', async () => {
    const res = await postTrigger('/on-post-delete', {
      postId: 't3_abc123',
      subreddit: { name: 'testsubreddit' },
    });
    expect(res.status).toBe(200);
  });

  it('clears postUrl from strike entries when post is deleted', async () => {
    seedUserRecord('t2_user1', {
      strikes: [{ postUrl: 'https://reddit.com/r/testsubreddit/comments/abc123/title/' }],
    });
    await postTrigger('/on-post-delete', { postId: 't3_abc123', subreddit: { name: 'testsubreddit' } });
    const saved = JSON.parse(store.get(strikeKey('t2_user1'))!);
    expect(saved.strikes[0].postUrl).toBe('');
  });

  it('clears contentId and contentUrl from removal entries for the deleted post', async () => {
    seedUserRecord('t2_user1', {
      removals: [{
        contentId: 't3_abc123',
        contentUrl: 'https://reddit.com/r/testsubreddit/comments/abc123/',
        ruleViolated: 'Rule 1',
        note: '',
        removedBy: 'mod',
        removedAt: new Date().toISOString(),
      }],
    });
    await postTrigger('/on-post-delete', { postId: 't3_abc123', subreddit: { name: 'testsubreddit' } });
    const saved = JSON.parse(store.get(strikeKey('t2_user1'))!);
    expect(saved.removals[0].contentId).toBe('');
    expect(saved.removals[0].contentUrl).toBe('');
  });

  it('does not modify records unrelated to the deleted post', async () => {
    seedUserRecord('t2_user1', {
      strikes: [{ postUrl: 'https://reddit.com/r/testsubreddit/comments/other999/title/' }],
    });
    await postTrigger('/on-post-delete', { postId: 't3_abc123', subreddit: { name: 'testsubreddit' } });
    const saved = JSON.parse(store.get(strikeKey('t2_user1'))!);
    expect(saved.strikes[0].postUrl).toContain('other999');
  });
});

// ─── /on-comment-delete ───────────────────────────────────────────────────────

describe('/on-comment-delete', () => {
  it('returns 200', async () => {
    const res = await postTrigger('/on-comment-delete', { commentId: 't1_xyz789' });
    expect(res.status).toBe(200);
  });

  it('clears contentId and contentUrl from removal entries for the deleted comment', async () => {
    seedUserRecord('t2_user1', {
      removals: [{
        contentId: 't1_xyz789',
        contentUrl: 'https://reddit.com/r/testsubreddit/comments/abc/title/xyz789/',
        ruleViolated: 'Rule 1',
        note: '',
        removedBy: 'mod',
        removedAt: new Date().toISOString(),
      }],
    });
    await postTrigger('/on-comment-delete', { commentId: 't1_xyz789' });
    const saved = JSON.parse(store.get(strikeKey('t2_user1'))!);
    expect(saved.removals[0].contentId).toBe('');
    expect(saved.removals[0].contentUrl).toBe('');
  });

  it('does not modify removal entries for a different comment', async () => {
    seedUserRecord('t2_user1', {
      removals: [{
        contentId: 't1_other111',
        contentUrl: 'https://reddit.com/r/testsubreddit/comments/abc/title/other111/',
        ruleViolated: 'Rule 1',
        note: '',
        removedBy: 'mod',
        removedAt: new Date().toISOString(),
      }],
    });
    await postTrigger('/on-comment-delete', { commentId: 't1_xyz789' });
    const saved = JSON.parse(store.get(strikeKey('t2_user1'))!);
    expect(saved.removals[0].contentId).toBe('t1_other111');
  });

  it('does not error when no users have records', async () => {
    const res = await postTrigger('/on-comment-delete', { commentId: 't1_xyz789' });
    expect(res.status).toBe(200);
  });
});

// ─── /on-app-install ──────────────────────────────────────────────────────────

describe('/on-app-install', () => {
  it('returns 200', async () => {
    const res = await postTrigger('/on-app-install', { subreddit: { name: 'testsubreddit' } });
    expect(res.status).toBe(200);
  });
});
