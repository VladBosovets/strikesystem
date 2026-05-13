import { describe, it, expect } from 'vitest';
import { buildAccountIntelDisplay, buildStrikeHistoryDisplay } from './strikes';
import type { StrikeRecord } from './redis';

// Both functions are pure — no mocks needed.

// ─── buildAccountIntelDisplay ─────────────────────────────────────────────────

function makeUser(ageDays: number, linkKarma: number, commentKarma: number) {
  const createdAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  return { createdAt, linkKarma, commentKarma };
}

describe('buildAccountIntelDisplay', () => {
  it('shows 🚨 for accounts under 7 days old', () => {
    const display = buildAccountIntelDisplay(makeUser(3, 5, 2) as never);
    expect(display).toContain('🚨 Very new account');
  });

  it('shows ⚠️ for accounts 7–29 days old', () => {
    const display = buildAccountIntelDisplay(makeUser(15, 50, 50) as never);
    expect(display).toContain('⚠️ New account');
    expect(display).not.toContain('🚨');
  });

  it('shows no age warning for accounts 30+ days old', () => {
    const display = buildAccountIntelDisplay(makeUser(200, 500, 500) as never);
    expect(display).not.toContain('⚠️ New account');
    expect(display).not.toContain('🚨 Very new');
  });

  it('shows 🚨 for almost-zero karma (< 10)', () => {
    const display = buildAccountIntelDisplay(makeUser(100, 2, 3) as never);
    expect(display).toContain('🚨 Almost zero karma');
  });

  it('shows ⚠️ for very low karma (10–99)', () => {
    const display = buildAccountIntelDisplay(makeUser(100, 10, 40) as never);
    expect(display).toContain('⚠️ Very low karma');
    expect(display).not.toContain('🚨 Almost zero');
  });

  it('shows no karma warning for normal karma (100+)', () => {
    const display = buildAccountIntelDisplay(makeUser(200, 200, 300) as never);
    expect(display).not.toContain('karma');
  });

  it('shows post and comment karma breakdown', () => {
    const display = buildAccountIntelDisplay(makeUser(200, 123, 456) as never);
    expect(display).toContain('123 post');
    expect(display).toContain('456 comment');
  });

  it('shows age in months for 30–364 day accounts', () => {
    const display = buildAccountIntelDisplay(makeUser(90, 500, 500) as never);
    expect(display).toContain('mo');
  });

  it('shows age in years for 365+ day accounts', () => {
    const display = buildAccountIntelDisplay(makeUser(400, 500, 500) as never);
    expect(display).toContain('yr');
  });

  it('can show multiple risk signals at once', () => {
    const display = buildAccountIntelDisplay(makeUser(2, 1, 0) as never);
    expect(display).toContain('🚨 Very new account');
    expect(display).toContain('🚨 Almost zero karma');
  });
});

// ─── buildStrikeHistoryDisplay ────────────────────────────────────────────────

function makeRecord(overrides: Partial<StrikeRecord> = {}): StrikeRecord {
  return {
    userId: 't2_abc',
    username: 'testuser',
    strikes: [],
    resets: [],
    removals: [],
    totalStrikes: 0,
    activeStrikes: 0,
    isBanned: false,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildStrikeHistoryDisplay', () => {
  it('returns no-record message for null', () => {
    expect(buildStrikeHistoryDisplay(null, 3)).toBe('No strikes on record.');
  });

  it('returns no-record message for empty strikes array', () => {
    expect(buildStrikeHistoryDisplay(makeRecord(), 3)).toBe('No strikes on record.');
  });

  it('shows active and total counts', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      activeStrikes: 1,
    });
    const display = buildStrikeHistoryDisplay(record, 3);
    expect(display).toContain('Active: 1/3');
    expect(display).toContain('All-time: 1');
  });

  it('shows banned status when isBanned is true', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      activeStrikes: 1,
      isBanned: true,
    });
    expect(buildStrikeHistoryDisplay(record, 3)).toContain('⛔');
  });

  it('does not show banned status when not banned', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      activeStrikes: 1,
    });
    expect(buildStrikeHistoryDisplay(record, 3)).not.toContain('⛔');
  });

  it('includes the rule and mod for each strike', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 2', note: '', issuedBy: 'testmod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      activeStrikes: 1,
    });
    const display = buildStrikeHistoryDisplay(record, 3);
    expect(display).toContain('Rule 2');
    expect(display).toContain('testmod');
  });

  it('includes mod note when present', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: 'first offence', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      totalStrikes: 1,
      activeStrikes: 1,
    });
    expect(buildStrikeHistoryDisplay(record, 3)).toContain('first offence');
  });

  it('shows reset entries in the history', () => {
    const record = makeRecord({
      strikes: [{ strikeNumber: 1, ruleViolated: 'Rule 1', note: '', issuedBy: 'mod', issuedAt: '2026-01-01T00:00:00.000Z', postUrl: '' }],
      resets: [{ resetAt: '2026-02-01T00:00:00.000Z', resetBy: 'admin', reason: 'appealed', strikesAtReset: 1 }],
      totalStrikes: 1,
      activeStrikes: 0,
    });
    const display = buildStrikeHistoryDisplay(record, 3);
    expect(display).toContain('Reset on');
    expect(display).toContain('admin');
    expect(display).toContain('appealed');
  });
});
