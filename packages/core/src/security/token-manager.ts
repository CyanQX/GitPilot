// ============================================================
// TokenManager — 多账号 Token 管理
// 依赖 ISecretStorage，不依赖任何平台
// ============================================================

import type { ISecretStorage } from '../interfaces/ISecretStorage';
import type { StoredAccount } from '../models/auth';
import { Logger } from '../utils/logger';

export class TokenManager {
  private logger = new Logger('TokenManager');
  private static readonly PREFIX = 'gitpilot.token.';
  private static readonly ACCOUNTS_KEY = 'gitpilot.accounts';
  private static readonly ACTIVE_KEY = 'gitpilot.activeAccount';

  constructor(private storage: ISecretStorage) {}

  /** 保存 Token */
  async save(login: string, token: string, platform: string): Promise<void> {
    await this.storage.set(TokenManager.PREFIX + login, token);

    const accounts = await this.getAccounts();
    const existing = accounts.find((a) => a.login === login);
    if (existing) {
      existing.lastUsedAt = new Date().toISOString();
    } else {
      accounts.push({
        login,
        platform,
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      });
    }
    await this.storage.set(TokenManager.ACCOUNTS_KEY, JSON.stringify(accounts));
    await this.storage.set(TokenManager.ACTIVE_KEY, login);

    this.logger.info(`Token 已保存: ${login} (${platform})`);
  }

  /** 获取活跃账号 Token */
  async getActive(): Promise<string | null> {
    const login = await this.storage.get(TokenManager.ACTIVE_KEY);
    if (!login) return null;
    return (await this.storage.get(TokenManager.PREFIX + login)) ?? null;
  }

  /** 获取指定账号 Token */
  async get(login: string): Promise<string | null> {
    return (await this.storage.get(TokenManager.PREFIX + login)) ?? null;
  }

  /** 删除 Token */
  async delete(login: string): Promise<void> {
    await this.storage.delete(TokenManager.PREFIX + login);

    let accounts = await this.getAccounts();
    accounts = accounts.filter((a) => a.login !== login);
    await this.storage.set(TokenManager.ACCOUNTS_KEY, JSON.stringify(accounts));

    const active = await this.storage.get(TokenManager.ACTIVE_KEY);
    if (active === login) {
      const next = accounts[0];
      if (next) {
        await this.storage.set(TokenManager.ACTIVE_KEY, next.login);
      } else {
        await this.storage.delete(TokenManager.ACTIVE_KEY);
      }
    }

    this.logger.info(`Token 已删除: ${login}`);
  }

  /** 获取所有账号 */
  async getAccounts(): Promise<StoredAccount[]> {
    const raw = await this.storage.get(TokenManager.ACCOUNTS_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  /** 切换活跃账号 */
  async switchTo(login: string): Promise<void> {
    const token = await this.get(login);
    if (!token) throw new Error(`未找到账号 ${login} 的 Token`);
    await this.storage.set(TokenManager.ACTIVE_KEY, login);
    this.logger.info(`已切换到: ${login}`);
  }

  /** 获取活跃账号名 */
  async getActiveLogin(): Promise<string | null> {
    return (await this.storage.get(TokenManager.ACTIVE_KEY)) ?? null;
  }

  /** 是否有已登录账号 */
  async hasAccount(): Promise<boolean> {
    return (await this.getActive()) !== null;
  }

  /** 清除所有 */
  async clearAll(): Promise<void> {
    const accounts = await this.getAccounts();
    for (const a of accounts) {
      await this.storage.delete(TokenManager.PREFIX + a.login);
    }
    await this.storage.delete(TokenManager.ACCOUNTS_KEY);
    await this.storage.delete(TokenManager.ACTIVE_KEY);
    this.logger.info('所有 Token 已清除');
  }
}
