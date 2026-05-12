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

export type DashboardUser = {
  userId: string;
  username: string;
  activeStrikes: number;
  totalStrikes: number;
  isBanned: boolean;
  lastUpdated: string;
};

export type DashboardUsersResponse = {
  users: DashboardUser[];
  maxStrikes: number;
};

export type DashboardUserDetail = {
  userId: string;
  username: string;
  activeStrikes: number;
  totalStrikes: number;
  isBanned: boolean;
  lastUpdated: string;
  strikes: StrikeEntry[];
  resets: ResetEntry[];
  removals: RemovalEntry[];
  modNotes: ModNote[];
};

export type DashboardUserDetailResponse = {
  user: DashboardUserDetail;
  maxStrikes: number;
};

export type DashboardConfigResponse = {
  maxStrikes: number;
  subredditName: string;
};
