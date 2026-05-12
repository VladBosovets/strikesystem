import { reddit, settings } from '@devvit/web/server';
import type { User } from '@devvit/reddit';
import {
  getStrikeRecord,
  saveStrikeRecord,
  DEFAULT_CONFIG,
  type StrikeRecord,
  type Config,
  type ResetEntry,
} from './redis';

export type { StrikeRecord, Config };

export type { ResetEntry };

export type AddStrikeData = {
  username: string;
  ruleViolated: string;
  note: string;
  issuedBy: string;
  postUrl: string;
};

async function loadConfig(): Promise<Config> {
  const maxStrikes = (await settings.get<number>('maxStrikes')) ?? DEFAULT_CONFIG.maxStrikesBeforeBan;
  const banDuration = (await settings.get<number>('banDuration')) ?? DEFAULT_CONFIG.banDuration;
  const rulesRaw = (await settings.get<string>('rules')) ?? '';
  const rules = rulesRaw.split('\n').filter(Boolean);
  const warningMessageTemplate = (await settings.get<string>('warningMessage')) ?? '';
  const notifyModmailOnBan = (await settings.get<boolean>('notifyModmail')) ?? DEFAULT_CONFIG.notifyModmailOnBan;

  return {
    maxStrikesBeforeBan: maxStrikes,
    banDuration,
    rules: rules.length > 0 ? rules : DEFAULT_CONFIG.rules,
    warningMessageTemplate,
    notifyModmailOnBan,
  };
}

export async function getStrikes(
  subredditId: string,
  userId: string
): Promise<StrikeRecord | null> {
  return getStrikeRecord(subredditId, userId);
}

export async function addStrike(
  subredditId: string,
  userId: string,
  data: AddStrikeData
): Promise<{ newTotal: number; config: Config }> {
  const config = await loadConfig();
  const existing = await getStrikeRecord(subredditId, userId);

  const newTotalStrikes = (existing?.totalStrikes ?? 0) + 1;
  const newActiveStrikes = (existing?.activeStrikes ?? existing?.totalStrikes ?? 0) + 1;

  const record: StrikeRecord = existing ?? {
    userId,
    username: data.username,
    strikes: [],
    resets: [],
    removals: [],
    totalStrikes: 0,
    activeStrikes: 0,
    isBanned: false,
    lastUpdated: new Date().toISOString(),
  };

  record.strikes.push({
    strikeNumber: newTotalStrikes,
    ruleViolated: data.ruleViolated,
    note: data.note,
    issuedBy: data.issuedBy,
    issuedAt: new Date().toISOString(),
    postUrl: data.postUrl,
  });
  record.totalStrikes = newTotalStrikes;
  record.activeStrikes = newActiveStrikes;
  record.username = data.username;
  record.lastUpdated = new Date().toISOString();

  await saveStrikeRecord(subredditId, userId, record);

  // newTotal is activeStrikes — this is what mods see in toasts and DMs
  return { newTotal: newActiveStrikes, config };
}

export async function checkAndBan(
  subredditId: string,
  userId: string,
  subredditName: string
): Promise<boolean> {
  const config = await loadConfig();
  const record = await getStrikeRecord(subredditId, userId);
  if (!record || record.isBanned) return false;
  if (record.activeStrikes < config.maxStrikesBeforeBan) return false;

  const banReason = buildBanReason(record);

  await reddit.banUser({
    subredditName,
    username: record.username,
    reason: banReason,
    message: `You have been banned from r/${subredditName} after reaching the maximum number of warnings.`,
    ...(config.banDuration > 0 ? { duration: config.banDuration } : {}),
  });

  record.isBanned = true;
  record.lastUpdated = new Date().toISOString();
  await saveStrikeRecord(subredditId, userId, record);

  if (config.notifyModmailOnBan) {
    try {
      await reddit.sendPrivateMessage({
        to: `/r/${subredditName}`,
        subject: `Auto-ban triggered: u/${record.username}`,
        text: `u/${record.username} has been automatically banned after reaching ${record.totalStrikes} warning(s).\n\n${banReason}`,
      });
    } catch (err) {
      console.error('Failed to send modmail on auto-ban:', err);
    }
  }

  return true;
}

export async function resetStrikes(
  subredditId: string,
  userId: string,
  resetBy: string,
  reason: string
): Promise<number | null> {
  const record = await getStrikeRecord(subredditId, userId);
  if (!record) return null;

  const strikesAtReset = record.activeStrikes;

  const resetEntry: ResetEntry = {
    resetAt: new Date().toISOString(),
    resetBy,
    reason,
    strikesAtReset,
  };

  record.resets.push(resetEntry);
  record.activeStrikes = 0;
  record.isBanned = false;
  record.lastUpdated = new Date().toISOString();

  await saveStrikeRecord(subredditId, userId, record);
  return strikesAtReset;
}

export function buildWarningDM(
  username: string,
  subredditName: string,
  strikeNumber: number,
  maxStrikes: number,
  ruleName: string,
  note: string,
  customTemplate: string
): string {
  if (customTemplate.trim()) {
    return customTemplate
      .replace(/{username}/g, username)
      .replace(/{subreddit}/g, subredditName)
      .replace(/{ruleName}/g, ruleName)
      .replace(/{strikeNumber}/g, String(strikeNumber))
      .replace(/{maxStrikes}/g, String(maxStrikes));
  }

  const noteSection = note.trim() ? `\nModerator note: ${note.trim()}\n` : '';

  const escalationWarning =
    strikeNumber === maxStrikes - 1
      ? '\n⚠️ One more violation may result in a permanent ban from this community.\n'
      : '';

  const banNotice =
    strikeNumber >= maxStrikes
      ? `\nYou have reached the maximum number of warnings and have been banned from r/${subredditName}.\n`
      : '';

  return `Hi u/${username},

A moderator of r/${subredditName} has issued you a warning.

Rule violated: ${ruleName}

This is warning ${strikeNumber} of ${maxStrikes}.
${noteSection}${escalationWarning}${banNotice}
If you believe this was issued in error, please contact the mod team:
https://www.reddit.com/message/compose?to=/r/${subredditName}

— The r/${subredditName} Mod Team`;
}

function buildBanReason(record: StrikeRecord): string {
  const lines = record.strikes.map(
    (s) => `Warning ${s.strikeNumber}: ${s.ruleViolated} (${s.issuedAt.slice(0, 10)})`
  );
  return `Auto-banned after ${record.totalStrikes} warning(s):\n${lines.join('\n')}`;
}

export function buildAccountIntelDisplay(user: User): string {
  const ageDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const totalKarma = user.linkKarma + user.commentKarma;

  const ageLabel =
    ageDays < 7   ? `${ageDays}d  🚨 Very new account` :
    ageDays < 30  ? `${ageDays}d  ⚠️ New account` :
    ageDays < 365 ? `${Math.floor(ageDays / 30)}mo` :
                    `${Math.floor(ageDays / 365)}yr`;

  const karmaLabel =
    totalKarma < 10  ? `${totalKarma}  🚨 Almost zero karma` :
    totalKarma < 100 ? `${totalKarma}  ⚠️ Very low karma` :
                       String(totalKarma);

  return [
    `Account age:  ${ageLabel}`,
    `Karma:        ${karmaLabel} (${user.linkKarma} post / ${user.commentKarma} comment)`,
  ].join('\n');
}

export function buildStrikeHistoryDisplay(
  record: StrikeRecord | null,
  maxStrikes: number
): string {
  if (!record || record.strikes.length === 0) return 'No warnings on record.';

  const lines: string[] = [];

  lines.push(`Active: ${record.activeStrikes}/${maxStrikes}  |  All-time: ${record.totalStrikes}`);
  if (record.isBanned) lines.push('⛔ Currently banned');
  lines.push('');

  for (const s of record.strikes) {
    lines.push(`#${s.strikeNumber} [${s.issuedAt.slice(0, 10)}] by u/${s.issuedBy}`);
    lines.push(`  Rule: ${s.ruleViolated}`);
    if (s.note) lines.push(`  Note: ${s.note}`);
  }

  for (const r of record.resets) {
    lines.push(`— Reset on ${r.resetAt.slice(0, 10)} by u/${r.resetBy} (had ${r.strikesAtReset} active strikes)`);
    if (r.reason) lines.push(`  Reason: ${r.reason}`);
  }

  return lines.join('\n');
}
