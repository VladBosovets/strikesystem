import { Hono } from 'hono';
import { context, settings, reddit } from '@devvit/web/server';
import { DEFAULT_CONFIG, getStrikeRecord, getWarnedUserIds, getModNotes, saveModNotes } from '../core/redis';
import { addStrike, checkAndBan, buildWarningDM, resetStrikes } from '../core/strikes';
import type {
  DashboardConfigResponse,
  DashboardUsersResponse,
  DashboardUserDetailResponse,
  StrikeActionResponse,
  ResetActionResponse,
  NoteActionResponse,
} from '../client/types/api';
import type { ModNote } from '../core/redis';

export const api = new Hono();

async function isMod(): Promise<boolean> {
  if (!context.userId) return false;
  const user = await reddit.getCurrentUser();
  if (!user) return false;
  const perms = await user.getModPermissionsForSubreddit(context.subredditName);
  return perms.includes('all') || perms.includes('posts');
}

async function loadRules(): Promise<string[]> {
  const raw = (await settings.get<string>('rules')) ?? DEFAULT_CONFIG.rules.join('\n');
  return raw.split('\n').filter(Boolean);
}

api.get('/dashboard/config', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const [maxStrikes, rules] = await Promise.all([
    settings.get<number>('maxStrikes').then((v) => v ?? DEFAULT_CONFIG.maxStrikesBeforeBan),
    loadRules(),
  ]);
  return c.json<DashboardConfigResponse>({ maxStrikes, subredditName: context.subredditName, rules });
});

api.get('/dashboard/users', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const maxStrikes =
    (await settings.get<number>('maxStrikes')) ?? DEFAULT_CONFIG.maxStrikesBeforeBan;

  const userIds = await getWarnedUserIds(context.subredditId);

  if (userIds.length === 0) {
    return c.json<DashboardUsersResponse>({ users: [], maxStrikes });
  }

  const records = await Promise.all(
    userIds.map((id) => getStrikeRecord(context.subredditId, id))
  );

  const users = records
    .filter((r) => r !== null)
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      activeStrikes: r.activeStrikes,
      totalStrikes: r.totalStrikes,
      isBanned: r.isBanned,
      lastUpdated: r.lastUpdated,
    }))
    .sort((a, b) => {
      if (a.isBanned !== b.isBanned) return a.isBanned ? -1 : 1;
      return b.activeStrikes - a.activeStrikes;
    });

  return c.json<DashboardUsersResponse>({ users, maxStrikes });
});

api.get('/dashboard/user/:userId', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const userId = c.req.param('userId');

  const [record, modNotes, maxStrikes, rules] = await Promise.all([
    getStrikeRecord(context.subredditId, userId),
    getModNotes(context.subredditId, userId),
    settings.get<number>('maxStrikes').then((v) => v ?? DEFAULT_CONFIG.maxStrikesBeforeBan),
    loadRules(),
  ]);

  if (!record) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json<DashboardUserDetailResponse>({
    user: {
      userId: record.userId,
      username: record.username,
      activeStrikes: record.activeStrikes,
      totalStrikes: record.totalStrikes,
      isBanned: record.isBanned,
      lastUpdated: record.lastUpdated,
      strikes: record.strikes,
      resets: record.resets,
      removals: record.removals,
      modNotes,
    },
    maxStrikes,
    rules,
  });
});

api.post('/dashboard/user/:userId/strike', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const userId = c.req.param('userId');
  const { rule, note } = await c.req.json<{ rule?: string; note?: string }>();

  if (!rule?.trim()) return c.json({ error: 'Rule is required' }, 400);

  const record = await getStrikeRecord(context.subredditId, userId);
  if (!record) return c.json({ error: 'User not found' }, 404);
  if (record.isBanned) return c.json({ error: 'User is already banned' }, 400);

  const { newTotal, config } = await addStrike(context.subredditId, userId, {
    username: record.username,
    ruleViolated: rule.trim(),
    note: note?.trim() ?? '',
    issuedBy: context.username ?? 'moderator',
    postUrl: '',
  });

  let dmFailed = false;
  try {
    const dmText = buildWarningDM(
      record.username, context.subredditName, newTotal,
      config.maxStrikesBeforeBan, rule.trim(), note?.trim() ?? '',
      config.warningMessageTemplate
    );
    await reddit.sendPrivateMessage({
      to: record.username,
      subject: `Strike from r/${context.subredditName}`,
      text: dmText,
    });
  } catch {
    dmFailed = true;
  }

  const wasBanned = await checkAndBan(context.subredditId, userId, context.subredditName, config);

  return c.json<StrikeActionResponse>({ newTotal, maxStrikes: config.maxStrikesBeforeBan, wasBanned, dmFailed });
});

api.post('/dashboard/user/:userId/reset', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const userId = c.req.param('userId');
  const { reason } = await c.req.json<{ reason?: string }>();

  if (!reason?.trim()) return c.json({ error: 'Reason is required' }, 400);

  const record = await getStrikeRecord(context.subredditId, userId);
  if (!record) return c.json({ error: 'User not found' }, 404);

  const wasBanned = record.isBanned;
  const resetBy = context.username ?? 'moderator';
  const strikesCleared = await resetStrikes(context.subredditId, userId, resetBy, reason.trim());

  let wasUnbanned = false;
  if (wasBanned) {
    try {
      await reddit.unbanUser(record.username, context.subredditName);
      wasUnbanned = true;
    } catch (err) {
      console.error('Failed to unban user during dashboard reset:', err);
    }
  }

  const existing = await getModNotes(context.subredditId, userId);
  const autoNote: ModNote = {
    id: `reset-${Date.now()}`,
    text: `⚠️ Strikes reset (${strikesCleared} cleared)${wasUnbanned ? ' — user unbanned' : ''} — Reason: ${reason.trim()}`,
    author: resetBy,
    createdAt: new Date().toISOString(),
  };
  await saveModNotes(context.subredditId, userId, [...existing, autoNote]);

  return c.json<ResetActionResponse>({ strikesCleared: strikesCleared ?? 0, wasUnbanned });
});

api.post('/dashboard/user/:userId/note', async (c) => {
  if (!await isMod()) return c.json({ error: 'Forbidden' }, 403);

  const userId = c.req.param('userId');
  const { note } = await c.req.json<{ note?: string }>();

  if (!note?.trim()) return c.json({ error: 'Note cannot be empty' }, 400);

  const record = await getStrikeRecord(context.subredditId, userId);
  if (!record) return c.json({ error: 'User not found' }, 404);

  const existing = await getModNotes(context.subredditId, userId);
  const newNote: ModNote = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: note.trim(),
    author: context.username ?? 'moderator',
    createdAt: new Date().toISOString(),
  };
  await saveModNotes(context.subredditId, userId, [...existing, newNote]);

  return c.json<NoteActionResponse>({ success: true });
});
