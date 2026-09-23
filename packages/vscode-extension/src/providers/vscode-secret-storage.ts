// ============================================================
// VSCodeSecretStorage — implements ISecretStorage
// Bridges the VS Code SecretStorage API
// ============================================================

import type { ISecretStorage } from '@gitpilot/core';
import * as vscode from 'vscode';

export class VSCodeSecretStorage implements ISecretStorage {
  constructor(private secrets: vscode.SecretStorage) {}

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.secrets.store(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.secrets.delete(key);
  }
}
