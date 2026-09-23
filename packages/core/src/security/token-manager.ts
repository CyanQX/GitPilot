// ============================================================
// TokenManager — multi-account Token management
// Depends on ISecretStorage, no platform dependencies
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

  /** Save a Token */
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

    this.logger.info(`Token saved: ${login} (${platform})`);
  }

  /** Get the active account's Token */
  async getActive(): Promise<string | null> {
    const login = await this.storage.get(TokenManager.ACTIVE_KEY);
    if (!login) return null;
    return (await this.storage.get(TokenManager.PREFIX + login)) ?? null;
  }

  /** Get the Token for a specific account */
  async get(login: string): Promise<string | null> {
    return (await this.storage.get(TokenManager.PREFIX + login)) ?? null;
  }

  /** Delete a Token */
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

    this.logger.info(`Token deleted: ${login}`);
  }

  /** Get all accounts */
  async getAccounts(): Promise<StoredAccount[]> {
    const raw = await this.storage.get(TokenManager.ACCOUNTS_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  /** Switch the active account */
  async switchTo(login: string): Promise<void> {
    const token = await this.get(login);
    if (!token) throw new Error(`No Token found for account ${login}`);
    await this.storage.set(TokenManager.ACTIVE_KEY, login);
    this.logger.info(`Switched to: ${login}`);
  }

  /** Get the active account login */
  async getActiveLogin(): Promise<string | null> {
    return (await this.storage.get(TokenManager.ACTIVE_KEY)) ?? null;
  }

  /** Whether there is a logged-in account */
  async hasAccount(): Promise<boolean> {
    return (await this.getActive()) !== null;
  }

  /** Clear everything */
  async clearAll(): Promise<void> {
    const accounts = await this.getAccounts();
    for (const a of accounts) {
      await this.storage.delete(TokenManager.PREFIX + a.login);
    }
    await this.storage.delete(TokenManager.ACCOUNTS_KEY);
    await this.storage.delete(TokenManager.ACTIVE_KEY);
    this.logger.info('All tokens cleared');
  }
}
