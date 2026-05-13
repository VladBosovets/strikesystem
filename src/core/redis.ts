import { redis } from '@devvit/web/server';

export type StrikeEntry = {
  strikeNumber: number;
  ruleViolated: string;
  note: string;
  issuedBy: string;
  issuedAt: string;
  postUrl: string;
};

export type ResetEntry = {
  resetAt: string;
  resetBy: string;
  reason: string;
  strikesAtReset: number;
};

export type RemovalEntry = {
  contentId: string;
  contentUrl: string;
  ruleViolated: string;
  note: string;
  removedBy: string;
  removedAt: string;
};

export type ModNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export type StrikeRecord = {
  userId: string;
  username: string;
  strikes: StrikeEntry[];
  resets: ResetEntry[];
  removals: RemovalEntry[];
  totalStrikes: number;
  activeStrikes: number;
  isBanned: boolean;
  lastUpdated: string;
};

export type Config = {
  maxStrikesBeforeBan: number;
  rules: string[];
  warningMessageTemplate: string;
  notifyModmailOnBan: boolean;
  banDuration: number;
};

export const DEFAULT_CONFIG: Config = {
  maxStrikesBeforeBan: 3,
  rules: ['Rule 1', 'Rule 2', 'Rule 3'],
  warningMessageTemplate: '',
  notifyModmailOnBan: true,
  banDuration: 0,
};

export type PendingWarn = {
  userId: string;
  username: string;
  postUrl: string;
};

export type PendingReset = {
  userId: string;
  username: string;
};

export type PendingModNote = {
  userId: string;
  username: string;
};

export type PendingRemoval = {
  userId: string;
  username: string;
  contentId: string;
  contentUrl: string;
  contentType: 'post' | 'comment';
};

const PENDING_WARN_TTL_SECONDS = 900;

const strikeKey = (subredditId: string, userId: string) =>
  `strikes:${subredditId}:${userId}`;

const warnedIndexKey = (subredditId: string) =>
  `warned-index:${subredditId}`;

const configKey = (subredditId: string) => `config:${subredditId}`;

const pendingWarnKey = (subredditId: string, modUserId: string) =>
  `warn-pending:${subredditId}:${modUserId}`;

const pendingResetKey = (subredditId: string, modUserId: string) =>
  `reset-pending:${subredditId}:${modUserId}`;

const pendingModNoteKey = (subredditId: string, modUserId: string) =>
  `modnote-pending:${subredditId}:${modUserId}`;

const pendingRemovalKey = (subredditId: string, modUserId: string) =>
  `removal-pending:${subredditId}:${modUserId}`;

const modNotesKey = (subredditId: string, userId: string) =>
  `mod-notes:${subredditId}:${userId}`;

// Fills in fields that old records (saved before Phase 2) won't have.
function normalizeRecord(raw: Partial<StrikeRecord> & Pick<StrikeRecord, 'userId' | 'username' | 'totalStrikes' | 'isBanned' | 'lastUpdated'>): StrikeRecord {
  return {
    ...raw,
    strikes: raw.strikes ?? [],
    resets: raw.resets ?? [],
    removals: raw.removals ?? [],
    activeStrikes: raw.activeStrikes ?? raw.totalStrikes,
  } as StrikeRecord;
}

export async function getStrikeRecord(
  subredditId: string,
  userId: string
): Promise<StrikeRecord | null> {
  const raw = await redis.get(strikeKey(subredditId, userId));
  if (!raw) return null;
  return normalizeRecord(JSON.parse(raw) as Parameters<typeof normalizeRecord>[0]);
}

export async function saveStrikeRecord(
  subredditId: string,
  userId: string,
  record: StrikeRecord
): Promise<void> {
  await Promise.all([
    redis.set(strikeKey(subredditId, userId), JSON.stringify(record)),
    redis.zAdd(warnedIndexKey(subredditId), { score: record.activeStrikes, member: userId }),
  ]);
}

export async function getConfig(subredditId: string): Promise<Config> {
  const raw = await redis.get(configKey(subredditId));
  return raw ? (JSON.parse(raw) as Config) : { ...DEFAULT_CONFIG };
}

export async function saveConfig(
  subredditId: string,
  config: Config
): Promise<void> {
  await redis.set(configKey(subredditId), JSON.stringify(config));
}

export async function deleteUserData(
  subredditId: string,
  userId: string
): Promise<void> {
  await redis.del(strikeKey(subredditId, userId));
}

export async function savePendingWarn(
  subredditId: string,
  modUserId: string,
  data: PendingWarn
): Promise<void> {
  const key = pendingWarnKey(subredditId, modUserId);
  await redis.set(key, JSON.stringify(data));
  await redis.expire(key, PENDING_WARN_TTL_SECONDS);
}

export async function popPendingWarn(
  subredditId: string,
  modUserId: string
): Promise<PendingWarn | null> {
  const key = pendingWarnKey(subredditId, modUserId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as PendingWarn;
}

export async function savePendingReset(
  subredditId: string,
  modUserId: string,
  data: PendingReset
): Promise<void> {
  const key = pendingResetKey(subredditId, modUserId);
  await redis.set(key, JSON.stringify(data));
  await redis.expire(key, PENDING_WARN_TTL_SECONDS);
}

export async function popPendingReset(
  subredditId: string,
  modUserId: string
): Promise<PendingReset | null> {
  const key = pendingResetKey(subredditId, modUserId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as PendingReset;
}

export async function getWarnedUserIds(subredditId: string): Promise<string[]> {
  const results = await redis.zRange(warnedIndexKey(subredditId), 0, -1, { by: 'rank', reverse: true });
  return results.map((r) => r.member);
}

export async function savePendingRemoval(
  subredditId: string,
  modUserId: string,
  data: PendingRemoval
): Promise<void> {
  const key = pendingRemovalKey(subredditId, modUserId);
  await redis.set(key, JSON.stringify(data));
  await redis.expire(key, PENDING_WARN_TTL_SECONDS);
}

export async function popPendingRemoval(
  subredditId: string,
  modUserId: string
): Promise<PendingRemoval | null> {
  const key = pendingRemovalKey(subredditId, modUserId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as PendingRemoval;
}

export async function savePendingModNote(
  subredditId: string,
  modUserId: string,
  data: PendingModNote
): Promise<void> {
  const key = pendingModNoteKey(subredditId, modUserId);
  await redis.set(key, JSON.stringify(data));
  await redis.expire(key, PENDING_WARN_TTL_SECONDS);
}

export async function popPendingModNote(
  subredditId: string,
  modUserId: string
): Promise<PendingModNote | null> {
  const key = pendingModNoteKey(subredditId, modUserId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as PendingModNote;
}

export async function getModNotes(
  subredditId: string,
  userId: string
): Promise<ModNote[]> {
  const raw = await redis.get(modNotesKey(subredditId, userId));
  return raw ? (JSON.parse(raw) as ModNote[]) : [];
}

export async function saveModNotes(
  subredditId: string,
  userId: string,
  notes: ModNote[]
): Promise<void> {
  await redis.set(modNotesKey(subredditId, userId), JSON.stringify(notes));
}

const dashboardPostKey = (subredditId: string) => `dashboard-post:${subredditId}`;

export type DashboardPostRef = { id: string; url: string };

export async function getDashboardPost(subredditId: string): Promise<DashboardPostRef | null> {
  const raw = await redis.get(dashboardPostKey(subredditId));
  if (!raw) return null;
  return JSON.parse(raw) as DashboardPostRef;
}

export async function saveDashboardPost(subredditId: string, id: string, url: string): Promise<void> {
  await redis.set(dashboardPostKey(subredditId), JSON.stringify({ id, url }));
}

export async function clearDashboardPost(subredditId: string): Promise<void> {
  await redis.del(dashboardPostKey(subredditId));
}
