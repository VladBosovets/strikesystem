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
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    expire: vi.fn(async () => {}),
    zAdd: vi.fn(async () => 0),
    zRange: mockZRange,
  },
  context: mockContext,
  settings: {
    get: vi.fn(async (key: string) => {
      if (key === 'maxStrikes') return 3;
      return undefined;
    }),
  },
}));

import { api } from './api';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SUB = 't5_sub123';

function strikeKey(userId: string) {
  return `strikes:${SUB}:${userId}`;
}

function seedUser(
  userId: string,
  username: string,
  activeStrikes: number,
  isBanned = false,
  totalStrikes = activeStrikes,
) {
  store.set(strikeKey(userId), JSON.stringify({
    userId,
    username,
    strikes: Array.from({ length: totalStrikes }, (_, i) => ({
      strikeNumber: i + 1,
      ruleViolated: 'Rule 1',
      note: 'test note',
      issuedBy: 'testmod',
      issuedAt: '2026-01-01T00:00:00.000Z',
      postUrl: 'https://reddit.com/r/test/comments/abc',
    })),
    resets: [],
    removals: [],
    totalStrikes,
    activeStrikes,
    isBanned,
    lastUpdated: '2026-01-01T00:00:00.000Z',
  }));
}

function seedModNotes(userId: string) {
  store.set(`mod-notes:${SUB}:${userId}`, JSON.stringify([
    { id: 'n1', text: 'watch this user', author: 'mod1', createdAt: '2026-01-01T00:00:00.000Z' },
  ]));
}

async function get(path: string) {
  return api.request(path, { method: 'GET' });
}

beforeEach(() => {
  store.clear();
  mockZRange.mockResolvedValue([]);
  mockContext.subredditName = 'testsubreddit';
});

// ─── GET /dashboard/config ────────────────────────────────────────────────────

describe('GET /dashboard/config', () => {
  it('returns maxStrikes from settings', async () => {
    const res = await get('/dashboard/config');
    const body = await res.json() as { maxStrikes: number; subredditName: string };
    expect(res.status).toBe(200);
    expect(body.maxStrikes).toBe(3);
  });

  it('returns subredditName from context', async () => {
    const res = await get('/dashboard/config');
    const body = await res.json() as { maxStrikes: number; subredditName: string };
    expect(body.subredditName).toBe('testsubreddit');
  });
});

// ─── GET /dashboard/users ─────────────────────────────────────────────────────

describe('GET /dashboard/users', () => {
  it('returns empty array when no users warned', async () => {
    const res = await get('/dashboard/users');
    const body = await res.json() as { users: unknown[]; maxStrikes: number };
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(body.maxStrikes).toBe(3);
  });

  it('returns warned users with correct fields', async () => {
    mockZRange.mockResolvedValue([{ member: 't2_user1', score: 1 }]);
    seedUser('t2_user1', 'alice', 2);

    const res = await get('/dashboard/users');
    const body = await res.json() as { users: { userId: string; username: string; activeStrikes: number }[]; maxStrikes: number };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.userId).toBe('t2_user1');
    expect(body.users[0]?.username).toBe('alice');
    expect(body.users[0]?.activeStrikes).toBe(2);
    expect(body.maxStrikes).toBe(3);
  });

  it('sorts users by activeStrikes descending', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_user1', score: 1 },
      { member: 't2_user2', score: 2 },
      { member: 't2_user3', score: 3 },
    ]);
    seedUser('t2_user1', 'alice', 1);
    seedUser('t2_user2', 'bob', 3);
    seedUser('t2_user3', 'carol', 2);

    const res = await get('/dashboard/users');
    const body = await res.json() as { users: { username: string; activeStrikes: number }[] };
    expect(body.users.map((u) => u.username)).toEqual(['bob', 'carol', 'alice']);
  });

  it('puts banned users first regardless of strike count', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_user1', score: 1 },
      { member: 't2_user2', score: 2 },
    ]);
    seedUser('t2_user1', 'active', 2, false);
    seedUser('t2_user2', 'banned', 1, true);

    const res = await get('/dashboard/users');
    const body = await res.json() as { users: { username: string; isBanned: boolean }[] };
    expect(body.users[0]?.username).toBe('banned');
    expect(body.users[0]?.isBanned).toBe(true);
    expect(body.users[1]?.username).toBe('active');
  });

  it('skips userId with no record gracefully', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_user1', score: 1 },
      { member: 't2_ghost', score: 2 },
    ]);
    seedUser('t2_user1', 'alice', 1);
    // t2_ghost has no record in store

    const res = await get('/dashboard/users');
    const body = await res.json() as { users: { userId: string }[] };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.userId).toBe('t2_user1');
  });

  it('stale index entry (userId in index but record deleted) does not crash and is omitted', async () => {
    mockZRange.mockResolvedValue([
      { member: 't2_stale', score: 1000 },
      { member: 't2_user1', score: 500 },
    ]);
    // t2_stale was deleted from redis but still in the sorted set index
    seedUser('t2_user1', 'bob', 1);

    const res = await get('/dashboard/users');
    expect(res.status).toBe(200);
    const body = await res.json() as { users: { userId: string }[] };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.userId).toBe('t2_user1');
  });
});

// ─── GET /dashboard/user/:userId ──────────────────────────────────────────────

describe('GET /dashboard/user/:userId', () => {
  it('returns 404 when user has no record', async () => {
    const res = await get('/dashboard/user/t2_nobody');
    expect(res.status).toBe(404);
  });

  it('returns full record with strikes, resets, removals fields', async () => {
    seedUser('t2_user1', 'alice', 2, false, 3);
    const res = await get('/dashboard/user/t2_user1');
    const body = await res.json() as {
      user: {
        userId: string;
        username: string;
        activeStrikes: number;
        totalStrikes: number;
        isBanned: boolean;
        strikes: unknown[];
        resets: unknown[];
        removals: unknown[];
        modNotes: unknown[];
      };
      maxStrikes: number;
    };
    expect(res.status).toBe(200);
    expect(body.user.userId).toBe('t2_user1');
    expect(body.user.username).toBe('alice');
    expect(body.user.activeStrikes).toBe(2);
    expect(body.user.totalStrikes).toBe(3);
    expect(body.user.isBanned).toBe(false);
    expect(body.user.strikes).toHaveLength(3);
    expect(body.user.resets).toEqual([]);
    expect(body.user.removals).toEqual([]);
    expect(body.user.modNotes).toEqual([]);
  });

  it('includes mod notes in the response', async () => {
    seedUser('t2_user1', 'alice', 1);
    seedModNotes('t2_user1');

    const res = await get('/dashboard/user/t2_user1');
    const body = await res.json() as { user: { modNotes: { text: string }[] } };
    expect(body.user.modNotes).toHaveLength(1);
    expect(body.user.modNotes[0]?.text).toBe('watch this user');
  });

  it('returns correct maxStrikes', async () => {
    seedUser('t2_user1', 'alice', 1);
    const res = await get('/dashboard/user/t2_user1');
    const body = await res.json() as { maxStrikes: number };
    expect(body.maxStrikes).toBe(3);
  });

  it('returns empty modNotes array when user has no notes', async () => {
    seedUser('t2_user1', 'alice', 1);
    const res = await get('/dashboard/user/t2_user1');
    const body = await res.json() as { user: { modNotes: unknown[] } };
    expect(body.user.modNotes).toEqual([]);
  });
});
