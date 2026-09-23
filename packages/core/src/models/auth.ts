// ============================================================
// Authentication data models
// ============================================================

export interface UserInfo {
  login: string;
  id: number;
  avatarUrl: string;
  name: string | null;
  email: string | null;
  htmlUrl: string;
}

export interface AuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  expiresAt?: Date;
  refreshToken?: string;
}

export interface StoredAccount {
  login: string;
  platform: string;
  addedAt: string;
  lastUsedAt: string;
}
