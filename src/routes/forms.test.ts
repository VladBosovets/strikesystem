import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store, mockReddit, mockContext } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  mockReddit: {
    sendPrivateMessage: vi.fn(async () => {}),
    banUser: vi.fn(async () => {}),
    unbanUser: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
  mockContext: {
    userId: 't2_mod123' as string | undefined,
    username: 'testmod' as string | undefined,
    subredditId: 't5_sub123',
    subredditName: 'testsubreddit',
  },
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    expire: vi.fn(async () => {}),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    zAdd: vi.fn(async () => 0),
    zRange: vi.fn(async () => []),
  },
  reddit: mockReddit,
  context: mockContext,
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

import { forms } from './forms';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SUB = 't5_sub123';
const MOD = 't2_mod123';
const TARGET_ID = 't2_target';
const TARGET_USER = 'targetuser';

async function post(path: string, body: unknown): Promise<{ showToast?: string }> {
  const res = await forms.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

const keys = {
  pendingWarn:    () => `warn-pending:${SUB}:${MOD}`,
  pendingReset:   () => `reset-pending:${SUB}:${MOD}`,
  pendingModNote: () => `modnote-pending:${SUB}:${MOD}`,
  pendingRemoval: () => `removal-pending:${SUB}:${MOD}`,
  strike:         (uid = TARGET_ID) => `strikes:${SUB}:${uid}`,
  modNotes:       (uid = TARGET_ID) => `mod-notes:${SUB}:${uid}`,
};

function seedPendingWarn() {
  store.set(keys.pendingWarn(), JSON.stringify({
    userId: TARGET_ID, username: TARGET_USER, postUrl: 'https://reddit.com/r/test/comments/abc',
  }));
}

function seedPendingReset() {
  store.set(keys.pendingReset(), JSON.stringify({ userId: TARGET_ID, username: TARGET_USER }));
}

function seedPendingModNote() {
  store.set(keys.pendingModNote(), JSON.stringify({ userId: TARGET_ID, username: TARGET_USER }));
}

function seedPendingRemoval(contentType: 'post' | 'comment' = 'post') {
  store.set(keys.pendingRemoval(), JSON.stringify({
    userId: TARGET_ID,
    username: TARGET_USER,
    contentId: contentType === 'comment' ? 't1_abc' : 't3_xyz',
    contentUrl: 'https://reddit.com/r/test/comments/xyz',
    contentType,
  }));
}

function seedStrikeRecord(activeStrikes: number, totalStrikes = activeStrikes, isBanned = false) {
  store.set(keys.strike(), JSON.stringify({
    userId: TARGET_ID,
    username: TARGET_USER,
    strikes: Array.from({ length: totalStrikes }, (_, i) => ({
      strikeNumber: i + 1,
      ruleViolated: 'Rule 1',
      note: '',
      issuedBy: 'testmod',
      issuedAt: '2026-01-01T00:00:00.000Z',
      postUrl: '',
    })),
    resets: [],
    removals: [],
    totalStrikes,
    activeStrikes,
    isBanned,
    lastUpdated: '2026-01-01T00:00:00.000Z',
  }));
}

beforeEach(() => {
  store.clear();
  mockReddit.sendPrivateMessage.mockClear();
  mockReddit.banUser.mockClear();
  mockReddit.unbanUser.mockClear();
  mockReddit.remove.mockClear();
  mockContext.userId = 't2_mod123';
  mockContext.username = 'testmod';
});

// ─── /warn-user-submit ────────────────────────────────────────────────────────

describe('/warn-user-submit', () => {
  it('returns error when mod identity is missing', async () => {
    mockContext.userId = undefined;
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Could not identify your account.');
  });

  it('returns error when session has expired', async () => {
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });

  it('returns error when no rule is selected', async () => {
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: '' });
    expect(res.showToast).toBe('Please select a rule.');
  });

  it('issues first strike and returns correct count in toast', async () => {
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('Strike 1/3');
    expect(res.showToast).toContain(TARGET_USER);
  });

  it('handles rule sent as array (Devvit select field format)', async () => {
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: ['Rule 2'] });
    expect(res.showToast).toContain('Strike 1/3');
  });

  it('sends a DM to the warned user', async () => {
    seedPendingWarn();
    await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(mockReddit.sendPrivateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: TARGET_USER })
    );
  });

  it('appends DM failure note to toast when user has messages restricted', async () => {
    mockReddit.sendPrivateMessage.mockRejectedValueOnce(new Error('NOT_WHITELISTED_BY_USER_MESSAGE'));
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('Strike 1/3');
    expect(res.showToast).toContain('DM not delivered');
  });

  it('does not append DM note when DM succeeds', async () => {
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).not.toContain('DM not delivered');
  });

  it('counts from existing active strikes on second strike', async () => {
    seedStrikeRecord(1);
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('Strike 2/3');
  });

  it('auto-bans on final warning and returns ban toast', async () => {
    seedStrikeRecord(2);
    seedPendingWarn();
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('auto-banned');
    expect(mockReddit.banUser).toHaveBeenCalled();
  });

  it('does not ban when below threshold', async () => {
    seedPendingWarn();
    await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(mockReddit.banUser).not.toHaveBeenCalled();
  });

  it('pops the session so a second submit is rejected', async () => {
    seedPendingWarn();
    await post('/warn-user-submit', { rule: 'Rule 1' });
    const res = await post('/warn-user-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });
});

// ─── /view-strikes-close ──────────────────────────────────────────────────────

describe('/view-strikes-close', () => {
  it('returns 200 with no toast so closing the form is silent', async () => {
    const res = await post('/view-strikes-close', {});
    expect(res.showToast).toBeUndefined();
  });
});

// ─── /reset-strikes-submit ────────────────────────────────────────────────────

describe('/reset-strikes-submit', () => {
  it('returns error when mod identity is missing', async () => {
    mockContext.userId = undefined;
    const res = await post('/reset-strikes-submit', { reason: 'appeal' });
    expect(res.showToast).toBe('Could not identify your account.');
  });

  it('returns error when session has expired', async () => {
    const res = await post('/reset-strikes-submit', { reason: 'appeal' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });

  it('returns error when reason is empty', async () => {
    seedPendingReset();
    const res = await post('/reset-strikes-submit', { reason: '   ' });
    expect(res.showToast).toBe('Please provide a reason for the reset.');
  });

  it('returns error when user has no strike record', async () => {
    seedPendingReset();
    const res = await post('/reset-strikes-submit', { reason: 'appeal' });
    expect(res.showToast).toContain('No strike record found');
  });

  it('returns correct cleared count in toast', async () => {
    seedStrikeRecord(2);
    seedPendingReset();
    const res = await post('/reset-strikes-submit', { reason: 'appeal approved' });
    expect(res.showToast).toContain('2 active strike(s) cleared');
    expect(res.showToast).toContain(TARGET_USER);
  });

  it('zeroes activeStrikes and writes reset entry to record', async () => {
    seedStrikeRecord(2);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'appeal approved' });
    const record = JSON.parse(store.get(keys.strike())!);
    expect(record.activeStrikes).toBe(0);
    expect(record.resets).toHaveLength(1);
    expect(record.resets[0].reason).toBe('appeal approved');
    expect(record.resets[0].resetBy).toBe('testmod');
  });

  it('preserves totalStrikes and strike history after reset', async () => {
    seedStrikeRecord(2);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'appeal' });
    const record = JSON.parse(store.get(keys.strike())!);
    expect(record.totalStrikes).toBe(2);
    expect(record.strikes).toHaveLength(2);
  });

  it('auto-writes a mod note recording the reset', async () => {
    seedStrikeRecord(2);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'appeal approved' });
    const notes = JSON.parse(store.get(keys.modNotes())!);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain('Strikes reset');
    expect(notes[0].text).toContain('appeal approved');
    expect(notes[0].author).toBe('testmod');
  });

  it('appends auto note to existing mod notes', async () => {
    store.set(keys.modNotes(), JSON.stringify([
      { id: 'prior', text: 'ban evader', author: 'mod1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]));
    seedStrikeRecord(1);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'pardoned' });
    const notes = JSON.parse(store.get(keys.modNotes())!);
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toBe('ban evader');
    expect(notes[1].text).toContain('Strikes reset');
  });

  it('pops the session so a second submit is rejected', async () => {
    seedStrikeRecord(1);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'appeal' });
    const res = await post('/reset-strikes-submit', { reason: 'again' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });

  it('calls unbanUser when the user was banned', async () => {
    seedStrikeRecord(3, 3, true);
    seedPendingReset();
    const res = await post('/reset-strikes-submit', { reason: 'appeal approved' });
    expect(mockReddit.unbanUser).toHaveBeenCalledWith(TARGET_USER, 'testsubreddit');
    expect(res.showToast).toContain('User has been unbanned.');
  });

  it('does not call unbanUser when the user was not banned', async () => {
    seedStrikeRecord(2);
    seedPendingReset();
    await post('/reset-strikes-submit', { reason: 'appeal' });
    expect(mockReddit.unbanUser).not.toHaveBeenCalled();
  });
});

// ─── /add-mod-note-submit ─────────────────────────────────────────────────────

describe('/add-mod-note-submit', () => {
  it('returns error when mod identity is missing', async () => {
    mockContext.userId = undefined;
    const res = await post('/add-mod-note-submit', { note: 'test' });
    expect(res.showToast).toBe('Could not identify your account.');
  });

  it('returns error when session has expired', async () => {
    const res = await post('/add-mod-note-submit', { note: 'test' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });

  it('returns error when note is empty', async () => {
    seedPendingModNote();
    const res = await post('/add-mod-note-submit', { note: '   ' });
    expect(res.showToast).toBe('Note cannot be empty.');
  });

  it('saves note and returns confirmation toast', async () => {
    seedPendingModNote();
    const res = await post('/add-mod-note-submit', { note: 'ban evader' });
    expect(res.showToast).toContain('Mod note saved');
    expect(res.showToast).toContain(TARGET_USER);
  });

  it('persists note to redis with correct author and text', async () => {
    seedPendingModNote();
    await post('/add-mod-note-submit', { note: 'ban evader' });
    const notes = JSON.parse(store.get(keys.modNotes())!);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('ban evader');
    expect(notes[0].author).toBe('testmod');
  });

  it('appends to existing notes rather than overwriting', async () => {
    store.set(keys.modNotes(), JSON.stringify([
      { id: 'old', text: 'first note', author: 'mod1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]));
    seedPendingModNote();
    await post('/add-mod-note-submit', { note: 'second note' });
    const notes = JSON.parse(store.get(keys.modNotes())!);
    expect(notes).toHaveLength(2);
    expect(notes[1].text).toBe('second note');
  });

  it('pops the session so a second submit is rejected', async () => {
    seedPendingModNote();
    await post('/add-mod-note-submit', { note: 'first' });
    const res = await post('/add-mod-note-submit', { note: 'second' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });
});

// ─── /remove-and-log-submit ───────────────────────────────────────────────────

describe('/remove-and-log-submit', () => {
  it('returns error when mod identity is missing', async () => {
    mockContext.userId = undefined;
    const res = await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Could not identify your account.');
  });

  it('returns error when session has expired', async () => {
    const res = await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });

  it('returns error when no rule is selected', async () => {
    seedPendingRemoval();
    const res = await post('/remove-and-log-submit', { rule: '' });
    expect(res.showToast).toBe('Please select a rule.');
  });

  it('calls reddit.remove with the correct content id', async () => {
    seedPendingRemoval('post');
    await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(mockReddit.remove).toHaveBeenCalledWith('t3_xyz', false);
  });

  it('returns post-specific toast for post removals', async () => {
    seedPendingRemoval('post');
    const res = await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('Post removed');
    expect(res.showToast).toContain(TARGET_USER);
  });

  it('returns comment-specific toast for comment removals', async () => {
    seedPendingRemoval('comment');
    const res = await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(res.showToast).toContain('Comment removed');
  });

  it('creates a new strike record when user has none', async () => {
    seedPendingRemoval('post');
    await post('/remove-and-log-submit', { rule: 'Rule 2' });
    const record = JSON.parse(store.get(keys.strike())!);
    expect(record.removals).toHaveLength(1);
    expect(record.removals[0].ruleViolated).toBe('Rule 2');
    expect(record.totalStrikes).toBe(0);
  });

  it('appends removal to existing record without touching strike count', async () => {
    seedStrikeRecord(1);
    seedPendingRemoval('comment');
    await post('/remove-and-log-submit', { rule: 'Rule 1', note: 'spam link' });
    const record = JSON.parse(store.get(keys.strike())!);
    expect(record.removals).toHaveLength(1);
    expect(record.removals[0].note).toBe('spam link');
    expect(record.totalStrikes).toBe(1);
  });

  it('pops the session so a second submit is rejected', async () => {
    seedPendingRemoval('post');
    await post('/remove-and-log-submit', { rule: 'Rule 1' });
    const res = await post('/remove-and-log-submit', { rule: 'Rule 1' });
    expect(res.showToast).toBe('Session expired. Please try again.');
  });
});
