import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Redis store, created before the mock factory via vi.hoisted.
const { store, banUser, sendPrivateMessage } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  banUser: vi.fn(async () => {}),
  sendPrivateMessage: vi.fn(async () => {}),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (...keys: string[]) => { keys.forEach((k) => store.delete(k)); }),
  },
  settings: {
    get: vi.fn(async (key: string) => {
      if (key === 'maxStrikes') return 3;
      if (key === 'banDuration') return 0;
      if (key === 'rules') return 'Rule 1\nRule 2\nRule 3';
      if (key === 'warningMessage') return '';
      if (key === 'notifyModmail') return false; // suppress modmail in tests
      return undefined;
    }),
  },
  reddit: { banUser, sendPrivateMessage },
}));

import { addStrike, checkAndBan } from './strikes';

const SUB_ID = 't5_abc' as `t5_${string}`;
const USER_ID = 't2_xyz' as `t2_${string}`;
const USERNAME = 'testuser';
const SUB_NAME = 'testsubreddit';

const strikeData = {
  username: USERNAME,
  ruleViolated: 'Rule 1',
  note: '',
  issuedBy: 'testmod',
  postUrl: 'https://reddit.com/r/testsubreddit/comments/abc',
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('addStrike', () => {
  it('creates a new record for a first-time user', async () => {
    const { newTotal } = await addStrike(SUB_ID, USER_ID, strikeData);
    expect(newTotal).toBe(1);
  });

  it('persists the strike to Redis', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    const raw = store.get(`strikes:${SUB_ID}:${USER_ID}`);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw!);
    expect(record.totalStrikes).toBe(1);
    expect(record.username).toBe(USERNAME);
    expect(record.strikes[0].ruleViolated).toBe('Rule 1');
  });

  it('increments the count on a second strike', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    const { newTotal } = await addStrike(SUB_ID, USER_ID, { ...strikeData, ruleViolated: 'Rule 2' });
    expect(newTotal).toBe(2);
  });

  it('appends each strike to the history', async () => {
    await addStrike(SUB_ID, USER_ID, { ...strikeData, ruleViolated: 'Rule 1' });
    await addStrike(SUB_ID, USER_ID, { ...strikeData, ruleViolated: 'Rule 2' });
    const raw = store.get(`strikes:${SUB_ID}:${USER_ID}`);
    const record = JSON.parse(raw!);
    expect(record.strikes).toHaveLength(2);
    expect(record.strikes[0].ruleViolated).toBe('Rule 1');
    expect(record.strikes[1].ruleViolated).toBe('Rule 2');
  });

  it('returns the loaded config alongside the new total', async () => {
    const { config } = await addStrike(SUB_ID, USER_ID, strikeData);
    expect(config.maxStrikesBeforeBan).toBe(3);
  });
});

describe('checkAndBan', () => {
  it('does not ban when below the strike threshold', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData); // 1/3
    const wasBanned = await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    expect(wasBanned).toBe(false);
    expect(banUser).not.toHaveBeenCalled();
  });

  it('bans the user when they hit the threshold', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData); // 3/3
    const wasBanned = await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    expect(wasBanned).toBe(true);
    expect(banUser).toHaveBeenCalledOnce();
    expect(banUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: USERNAME, subredditName: SUB_NAME })
    );
  });

  it('marks the user as banned in Redis after auto-ban', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    const raw = store.get(`strikes:${SUB_ID}:${USER_ID}`);
    const record = JSON.parse(raw!);
    expect(record.isBanned).toBe(true);
  });

  it('does not ban again if the user is already banned', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME); // first ban
    const secondCall = await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    expect(secondCall).toBe(false);
    expect(banUser).toHaveBeenCalledOnce(); // still only once
  });

  it('returns false for a user with no record', async () => {
    const wasBanned = await checkAndBan(SUB_ID, 't2_nobody' as `t2_${string}`, SUB_NAME);
    expect(wasBanned).toBe(false);
  });
});
