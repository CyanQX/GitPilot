// ============================================================
// IAuthProvider — authentication abstraction
// GitHub OAuth / GitLab PAT / Gitee Token → unified as Token
// ============================================================

import type { UserInfo, AuthToken } from '../models/auth';

export interface IAuthProvider {
  /** Platform identifier */
  readonly platform: string;

  /** Get the authorization URL (OAuth Web Flow); a custom redirectUri may be provided */
  getAuthorizationUrl(state?: string): string;

  /** Exchange an authorization code for a Token; the same redirectUri as the authorization URL may be provided */
  exchangeCodeForToken(code: string): Promise<AuthToken>;

  /** Validate whether a Token is valid */
  validateToken(token: string): Promise<boolean>;

  /** Get user info using a Token */
  getUserInfo(token: string): Promise<UserInfo>;

  /** Refresh a Token */
  refreshToken(refreshToken: string): Promise<AuthToken>;

  /** Revoke a Token */
  revokeToken(token: string): Promise<void>;

  /** Get the minimal scopes required for authorization */
  getRequiredScopes(): string[];
}
