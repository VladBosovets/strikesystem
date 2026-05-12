import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ────────────────────────────────────────────────────────────────────

const { store, mockContext } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  mockContext: {
    subredditId: 't5_sub123' as string,
    subredditName: 'testsubreddit',
  },
}));

vi.mock('@devvit/web/server', () => ({
  context: mockContext,
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
  },
}));

import { triggers } from './triggers';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SUB = 't5_sub123';

function dashboardKey() { return `dashboard-post:${SUB}`; }

function seedDashboardPost(id: string, url: string) {
  store.set(dashboardKey(), JSON.stringify({ id, url }));
}

async function postTrigger(path: string, body: object) {
  const res = await triggers.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

beforeEach(() => { store.clear(); });

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
    expect(store.has(dashboardKey())).toBe(false);
  });
});

// ─── /on-app-install ──────────────────────────────────────────────────────────

describe('/on-app-install', () => {
  it('returns 200', async () => {
    const res = await postTrigger('/on-app-install', { subreddit: { name: 'testsubreddit' } });
    expect(res.status).toBe(200);
  });
});
