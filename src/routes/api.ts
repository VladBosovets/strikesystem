import { Hono } from 'hono';
import { context, settings } from '@devvit/web/server';
import { DEFAULT_CONFIG, getStrikeRecord, getWarnedUserIds, getModNotes } from '../core/redis';
import type { DashboardConfigResponse, DashboardUsersResponse, DashboardUserDetailResponse } from '../client/types/api';

export const api = new Hono();

api.get('/dashboard/config', async (c) => {
  const maxStrikes =
    (await settings.get<number>('maxStrikes')) ?? DEFAULT_CONFIG.maxStrikesBeforeBan;
  return c.json<DashboardConfigResponse>({
    maxStrikes,
    subredditName: context.subredditName,
  });
});

api.get('/dashboard/users', async (c) => {
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
  const userId = c.req.param('userId');
  const maxStrikes =
    (await settings.get<number>('maxStrikes')) ?? DEFAULT_CONFIG.maxStrikesBeforeBan;

  const [record, modNotes] = await Promise.all([
    getStrikeRecord(context.subredditId, userId),
    getModNotes(context.subredditId, userId),
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
  });
});
