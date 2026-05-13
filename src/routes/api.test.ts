import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ────────────────────────────────────────────────────────────────────

const { store, mockZRange, mockContext, mockUser, mockReddit } = vi.hoisted(() => {
  const mockUser = {
    getModPermissionsForSubreddit: vi.fn(async () => ['all'] as string[]),
  };
  const mockZRange = vi.fn(async () => [] as { member: string; score: number }[]);
  const mockReddit = {
    getCurrentUser: vi.fn(async () => mockUser),
    sendPrivateMessage: vi.fn(async () => {}),
    banUser: vi.fn(async () => {}),
    unbanUser: vi.fn(async () => {}),
  };
  return {
    store: new Map<string, string>(),
    mockZRange,
    mockUser,
    mockReddit,
    mockContext: {
      userId: 't2_mod123' as string | undefined,
      username: 'testmod' as string | undefined,
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
  reddit: mockReddit,
  settings: {
    get: vi.fn(async (key: string) => {
      if (key === 'maxStrikes') return 3;
      if (key === 'banDuration') return 0;
      if (key === 'rules') return 'Rule 1\nRule 2\nRule 3';
      if (key === 'warningMessage') return '';
      if (key === 'notifyModmail') return false;
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

async function post(path: string, body: unknown) {
  return api.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  store.clear();
  mockZRange.mockResolvedValue([]);
  mockContext.userId = 't2_mod123';
  mockContext.username = 'testmod';
  mockUser.getModPermissionsForSubreddit.mockResolvedValue(['all']);
  mockReddit.sendPrivateMessage.mockClear();
  mockReddit.banUser.mockClear();
  mockReddit.unbanUser.mockClear();
});

// ─── permission checks ────────────────────────────────────────────────────────

describe('dashboard API — permission checks', () => {
  it('GET /dashboard/config returns 403 when user has no mod permissions', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['wiki']);
    const res = await get('/dashboard/config');
    expect(res.status).toBe(403);
  });

  it('GET /dashboard/users returns 403 when user has no mod permissions', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue([]);
    const res = await get('/dashboard/users');
    expect(res.status).toBe(403);
  });

  it('GET /dashboard/user/:userId returns 403 when user has no mod permissions', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['flair']);
    const res = await get('/dashboard/user/t2_anyone');
    expect(res.status).toBe(403);
  });

  it('GET /dashboard/config returns 403 when userId is missing from context', async () => {
    mockContext.userId = undefined;
    const res = await get('/dashboard/config');
    expect(res.status).toBe(403);
  });

  it('all endpoints return 200 for a user with posts permission', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValue(['posts']);
    seedUser('t2_u1', 'alice', 1);
    const [cfg, users, user] = await Promise.all([
      get('/dashboard/config'),
      get('/dashboard/users'),
      get('/dashboard/user/t2_u1'),
    ]);
    expect(cfg.status).toBe(200);
    expect(users.status).toBe(200);
    expect(user.status).toBe(200);
  });
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

  it('includes rules array in response', async () => {
    seedUser('t2_user1', 'alice', 1);
    const res = await get('/dashboard/user/t2_user1');
    const body = await res.json() as { rules: string[] };
    expect(body.rules).toEqual(['Rule 1', 'Rule 2', 'Rule 3']);
  });
});

// ─── POST /dashboard/user/:userId/strike ─────────────────────────────────────

describe('POST /dashboard/user/:userId/strike', () => {
  it('issues a strike and returns newTotal', async () => {
    seedUser('t2_user1', 'alice', 0);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: 'Rule 1', note: '' });
    const body = await res.json() as { newTotal: number; wasBanned: boolean };
    expect(res.status).toBe(200);
    expect(body.newTotal).toBe(1);
    expect(body.wasBanned).toBe(false);
  });

  it('returns 400 when rule is missing', async () => {
    seedUser('t2_user1', 'alice', 0);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when user has no record', async () => {
    const res = await post('/dashboard/user/t2_nobody/strike', { rule: 'Rule 1' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when user is already banned', async () => {
    seedUser('t2_user1', 'alice', 3, true);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: 'Rule 1' });
    expect(res.status).toBe(400);
  });

  it('sets wasBanned true and triggers auto-ban on final strike', async () => {
    seedUser('t2_user1', 'alice', 2);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: 'Rule 1' });
    const body = await res.json() as { wasBanned: boolean };
    expect(body.wasBanned).toBe(true);
    expect(mockReddit.banUser).toHaveBeenCalled();
  });

  it('sets dmFailed true when sendPrivateMessage throws', async () => {
    mockReddit.sendPrivateMessage.mockRejectedValueOnce(new Error('NOT_WHITELISTED'));
    seedUser('t2_user1', 'alice', 0);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: 'Rule 1' });
    const body = await res.json() as { dmFailed: boolean };
    expect(body.dmFailed).toBe(true);
  });

  it('returns 403 for non-mods', async () => {
    mockUser.getModPermissionsForSubreddit.mockResolvedValueOnce([]);
    seedUser('t2_user1', 'alice', 0);
    const res = await post('/dashboard/user/t2_user1/strike', { rule: 'Rule 1' });
    expect(res.status).toBe(403);
  });
});

// ─── POST /dashboard/user/:userId/reset ──────────────────────────────────────

describe('POST /dashboard/user/:userId/reset', () => {
  it('resets strikes and returns strikesCleared', async () => {
    seedUser('t2_user1', 'alice', 2);
    const res = await post('/dashboard/user/t2_user1/reset', { reason: 'appeal' });
    const body = await res.json() as { strikesCleared: number; wasUnbanned: boolean; unbanFailed: boolean };
    expect(res.status).toBe(200);
    expect(body.strikesCleared).toBe(2);
    expect(body.wasUnbanned).toBe(false);
    expect(body.unbanFailed).toBe(false);
  });

  it('calls unbanUser and sets wasUnbanned when user was banned', async () => {
    seedUser('t2_user1', 'alice', 3, true);
    const res = await post('/dashboard/user/t2_user1/reset', { reason: 'appeal' });
    const body = await res.json() as { wasUnbanned: boolean; unbanFailed: boolean };
    expect(mockReddit.unbanUser).toHaveBeenCalledWith('alice', 'testsubreddit');
    expect(body.wasUnbanned).toBe(true);
    expect(body.unbanFailed).toBe(false);
  });

  it('sets unbanFailed when unbanUser throws', async () => {
    seedUser('t2_user1', 'alice', 3, true);
    mockReddit.unbanUser.mockRejectedValueOnce(new Error('API error'));
    const res = await post('/dashboard/user/t2_user1/reset', { reason: 'appeal' });
    const body = await res.json() as { wasUnbanned: boolean; unbanFailed: boolean };
    expect(body.wasUnbanned).toBe(false);
    expect(body.unbanFailed).toBe(true);
  });

  it('returns 400 when reason is missing', async () => {
    seedUser('t2_user1', 'alice', 2);
    const res = await post('/dashboard/user/t2_user1/reset', { reason: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when user has no record', async () => {
    const res = await post('/dashboard/user/t2_nobody/reset', { reason: 'appeal' });
    expect(res.status).toBe(404);
  });

  it('writes an auto mod note on reset', async () => {
    seedUser('t2_user1', 'alice', 2);
    await post('/dashboard/user/t2_user1/reset', { reason: 'good behaviour' });
    const notes = JSON.parse(store.get(`mod-notes:${SUB}:t2_user1`) ?? '[]') as { text: string }[];
    expect(notes[0]?.text).toContain('Strikes reset');
    expect(notes[0]?.text).toContain('good behaviour');
  });
});

// ─── POST /dashboard/user/:userId/note ───────────────────────────────────────

describe('POST /dashboard/user/:userId/note', () => {
  it('saves a mod note and returns success', async () => {
    seedUser('t2_user1', 'alice', 1);
    const res = await post('/dashboard/user/t2_user1/note', { note: 'watch carefully' });
    const body = await res.json() as { success: boolean };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const notes = JSON.parse(store.get(`mod-notes:${SUB}:t2_user1`) ?? '[]') as { text: string }[];
    expect(notes[0]?.text).toBe('watch carefully');
  });

  it('returns 400 when note is empty', async () => {
    seedUser('t2_user1', 'alice', 1);
    const res = await post('/dashboard/user/t2_user1/note', { note: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when user has no record', async () => {
    const res = await post('/dashboard/user/t2_nobody/note', { note: 'test' });
    expect(res.status).toBe(404);
  });

  it('appends to existing notes', async () => {
    seedUser('t2_user1', 'alice', 1);
    seedModNotes('t2_user1');
    await post('/dashboard/user/t2_user1/note', { note: 'second note' });
    const notes = JSON.parse(store.get(`mod-notes:${SUB}:t2_user1`) ?? '[]') as { text: string }[];
    expect(notes).toHaveLength(2);
    expect(notes[1]?.text).toBe('second note');
  });
});
