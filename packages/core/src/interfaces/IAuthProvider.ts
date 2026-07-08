// ============================================================
// IAuthProvider — 认证抽象
// GitHub OAuth / GitLab PAT / Gitee Token → 统一为 Token
// ============================================================

import type { UserInfo, AuthToken } from '../models/auth';

export interface IAuthProvider {
  /** 平台标识 */
  readonly platform: string;

  /** 获取授权 URL（OAuth Web Flow），可传入自定义 redirectUri */
  getAuthorizationUrl(state?: string): string;

  /** 用授权码换取 Token，可传入与授权 URL 相同的 redirectUri */
  exchangeCodeForToken(code: string): Promise<AuthToken>;

  /** 验证 Token 是否有效 */
  validateToken(token: string): Promise<boolean>;

  /** 用 Token 获取用户信息 */
  getUserInfo(token: string): Promise<UserInfo>;

  /** 刷新 Token */
  refreshToken(refreshToken: string): Promise<AuthToken>;

  /** 撤销 Token */
  revokeToken(token: string): Promise<void>;

  /** 获取授权所需的最小权限范围 */
  getRequiredScopes(): string[];
}
