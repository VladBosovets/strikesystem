import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      if (key === 'notifyModmail') return false;
      return undefined;
    }),
  },
  reddit: { banUser, sendPrivateMessage },
}));

import { addStrike, checkAndBan, resetStrikes } from './strikes';
import { getStrikeRecord } from './redis';

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

// ─── addStrike ────────────────────────────────────────────────────────────────

describe('addStrike', () => {
  it('creates a new record with both counters at 1', async () => {
    const { newTotal } = await addStrike(SUB_ID, USER_ID, strikeData);
    expect(newTotal).toBe(1);

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.totalStrikes).toBe(1);
    expect(record?.activeStrikes).toBe(1);
  });

  it('increments both totalStrikes and activeStrikes together', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.totalStrikes).toBe(2);
    expect(record?.activeStrikes).toBe(2);
  });

  it('initialises resets and removals as empty arrays', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.resets).toEqual([]);
    expect(record?.removals).toEqual([]);
  });

  it('returns activeStrikes as newTotal (used for DM and toast)', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    const { newTotal } = await addStrike(SUB_ID, USER_ID, strikeData);
    expect(newTotal).toBe(3);
  });
});

// ─── checkAndBan ─────────────────────────────────────────────────────────────

describe('checkAndBan', () => {
  it('does not ban when activeStrikes is below threshold', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(false);
    expect(banUser).not.toHaveBeenCalled();
  });

  it('bans when activeStrikes hits the threshold', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(true);
    expect(banUser).toHaveBeenCalledOnce();
  });

  it('does not ban again if already banned', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(false);
    expect(banUser).toHaveBeenCalledOnce();
  });

  it('does not ban if record does not exist', async () => {
    expect(await checkAndBan(SUB_ID, 't2_nobody' as `t2_${string}`, SUB_NAME)).toBe(false);
  });
});

// ─── resetStrikes ─────────────────────────────────────────────────────────────

describe('resetStrikes', () => {
  it('sets activeStrikes to 0', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', 'user improved');

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.activeStrikes).toBe(0);
  });

  it('does NOT change totalStrikes', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', '');

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.totalStrikes).toBe(2);
  });

  it('preserves the full strike history', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', '');

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.strikes).toHaveLength(2);
  });

  it('appends a ResetEntry with correct metadata', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', 'user reformed');

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.resets).toHaveLength(1);
    expect(record?.resets[0]?.resetBy).toBe('testmod');
    expect(record?.resets[0]?.reason).toBe('user reformed');
    expect(record?.resets[0]?.strikesAtReset).toBe(2);
  });

  it('clears isBanned flag', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', 'appeal approved');

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.isBanned).toBe(false);
  });

  it('returns null for a user with no record', async () => {
    const result = await resetStrikes(SUB_ID, 't2_nobody' as `t2_${string}`, 'testmod', '');
    expect(result).toBeNull();
  });

  it('returns the number of strikes that were active at reset', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    const strikesAtReset = await resetStrikes(SUB_ID, USER_ID, 'testmod', '');
    expect(strikesAtReset).toBe(2);
  });
});

// ─── activeStrikes after reset ────────────────────────────────────────────────

describe('activeStrikes resets correctly after a reset + new strikes', () => {
  it('activeStrikes starts from 1 again after a reset', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', 'appeal approved');

    const { newTotal } = await addStrike(SUB_ID, USER_ID, strikeData);
    expect(newTotal).toBe(1); // active restarted from 0
  });

  it('totalStrikes keeps accumulating across resets', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', '');
    await addStrike(SUB_ID, USER_ID, strikeData);

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.totalStrikes).toBe(3);
    expect(record?.activeStrikes).toBe(1);
  });

  it('checkAndBan does not trigger during second round until threshold is hit again', async () => {
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await addStrike(SUB_ID, USER_ID, strikeData);
    await checkAndBan(SUB_ID, USER_ID, SUB_NAME);
    await resetStrikes(SUB_ID, USER_ID, 'testmod', '');

    await addStrike(SUB_ID, USER_ID, strikeData); // active: 1
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(false);

    await addStrike(SUB_ID, USER_ID, strikeData); // active: 2
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(false);

    await addStrike(SUB_ID, USER_ID, strikeData); // active: 3 → ban
    expect(await checkAndBan(SUB_ID, USER_ID, SUB_NAME)).toBe(true);
    expect(banUser).toHaveBeenCalledTimes(2); // banned once before, once now
  });
});

// ─── backwards compatibility ─────────────────────────────────────────────────

describe('backwards compatibility with old records', () => {
  it('old record missing activeStrikes/resets/removals is normalised on read', async () => {
    // Simulate an old record written before Phase 2
    const oldRecord = {
      userId: USER_ID,
      username: USERNAME,
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      isBanned: false,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      // no activeStrikes, no resets, no removals
    };
    store.set(`strikes:${SUB_ID}:${USER_ID}`, JSON.stringify(oldRecord));

    const record = await getStrikeRecord(SUB_ID, USER_ID);
    expect(record?.activeStrikes).toBe(1); // defaults to totalStrikes
    expect(record?.resets).toEqual([]);
    expect(record?.removals).toEqual([]);
  });
});
