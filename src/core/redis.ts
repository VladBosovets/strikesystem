import { redis } from '@devvit/web/server';

export type StrikeEntry = {
  strikeNumber: number;
  ruleViolated: string;
  note: string;
  issuedBy: string;
  issuedAt: string;
  postUrl: string;
};

export type StrikeRecord = {
  userId: string;
  username: string;
  strikes: StrikeEntry[];
  totalStrikes: number;
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

const PENDING_WARN_TTL_SECONDS = 900; // 15 minutes

const strikeKey = (subredditId: string, userId: string) =>
  `strikes:${subredditId}:${userId}`;

const configKey = (subredditId: string) => `config:${subredditId}`;

const pendingWarnKey = (subredditId: string, modUserId: string) =>
  `warn-pending:${subredditId}:${modUserId}`;

export async function getStrikeRecord(
  subredditId: string,
  userId: string
): Promise<StrikeRecord | null> {
  const raw = await redis.get(strikeKey(subredditId, userId));
  return raw ? (JSON.parse(raw) as StrikeRecord) : null;
}

export async function saveStrikeRecord(
  subredditId: string,
  userId: string,
  record: StrikeRecord
): Promise<void> {
  await redis.set(strikeKey(subredditId, userId), JSON.stringify(record));
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
