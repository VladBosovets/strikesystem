import { describe, it, expect } from 'vitest';
import { buildWarningDM } from './strikes';

// buildWarningDM is a pure function — no mocks needed.

describe('buildWarningDM', () => {
  const base = {
    username: 'testuser',
    subredditName: 'testsubreddit',
    ruleName: 'Rule 1 - No spam',
    note: '',
    customTemplate: '',
  };

  it('includes the username and subreddit', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', '');
    expect(msg).toContain('u/testuser');
    expect(msg).toContain('r/testsubreddit');
  });

  it('includes the rule name', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', '');
    expect(msg).toContain('Rule 1 - No spam');
  });

  it('shows correct strike count', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 2, 3, base.ruleName, '', '');
    expect(msg).toContain('strike 2 of 3');
  });

  it('does not include escalation warning on first strike', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', '');
    expect(msg).not.toContain('One more strike');
  });

  it('includes escalation warning on penultimate strike', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 2, 3, base.ruleName, '', '');
    expect(msg).toContain('One more strike');
  });

  it('includes ban notice on final strike', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 3, 3, base.ruleName, '', '');
    expect(msg).toContain('been banned');
  });

  it('does not include ban notice before final strike', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 2, 3, base.ruleName, '', '');
    expect(msg).not.toContain('been banned');
  });

  it('includes moderator note when provided', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, 'be nicer', '');
    expect(msg).toContain('be nicer');
  });

  it('does not include note section when note is empty', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', '');
    expect(msg).not.toContain('Moderator note');
  });

  it('includes modmail appeal link', () => {
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', '');
    expect(msg).toContain('reddit.com/message/compose?to=/r/testsubreddit');
  });

  it('uses custom template with placeholders replaced', () => {
    const template = 'Hey {username}, you broke {ruleName} in r/{subreddit}. Strike {strikeNumber}/{maxStrikes}.';
    const msg = buildWarningDM('alice', 'mysub', 2, 5, 'Rule 2', '', template);
    expect(msg).toBe('Hey alice, you broke Rule 2 in r/mysub. Strike 2/5.');
  });

  it('returns custom template unchanged when no placeholders match', () => {
    const template = 'Simple custom message.';
    const msg = buildWarningDM(base.username, base.subredditName, 1, 3, base.ruleName, '', template);
    expect(msg).toBe('Simple custom message.');
  });
});
