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

const strikeKey = (subredditId: string, userId: string) =>
  `strikes:${subredditId}:${userId}`;

const configKey = (subredditId: string) => `config:${subredditId}`;

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
