// ============================================================
// VSCodeGitProvider - IGitProvider implementation based on simple-git
// ============================================================

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { IGitProvider, GitStatus, CommitResult, PushResult } from '@gitpilot/core';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

const GIT_NOT_FOUND_PREFIX = 'GIT_NOT_FOUND:';
const NOT_GIT_REPO_PREFIX = 'NOT_GIT_REPO:';
const GIT_AUTHOR_MISSING_PREFIX = 'GIT_AUTHOR_MISSING:';

export class VSCodeGitProvider implements IGitProvider {
  private git: SimpleGit;
  private readonly gitBinary: string;

  constructor(workspaceRoot: string) {
    this.gitBinary = this.resolveGitBinary();
    this.git = simpleGit(workspaceRoot, this.getSimpleGitOptions());
  }

  async isRepo(): Promise<boolean> {
    try { return await this.git.checkIsRepo(); } catch { return false; }
  }

  async init(): Promise<void> {
    try {
      await this.git.init();
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const s = await this.git.status();
      return {
        isClean: s.isClean(),
        modified: s.modified,
        added: s.created,
        deleted: s.deleted,
        untracked: s.not_added,
        staged: s.staged,
        currentBranch: s.current ?? 'unknown',
        ahead: s.ahead,
        behind: s.behind,
        hasConflicts: s.conflicted.length > 0,
      };
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async hasChanges(): Promise<boolean> {
    const s = await this.getStatus();
    return !s.isClean;
  }

  async stageFiles(excludeFiles?: string[]): Promise<void> {
    try {
      await this.git.raw(['add', '-A']);
      if (excludeFiles && excludeFiles.length > 0) {
        for (const f of excludeFiles) {
          try { await this.git.raw(['reset', '--', f]); } catch {
            try { await this.git.raw(['rm', '--cached', '-r', '--quiet', f]); } catch { /* ignore */ }
          }
        }
      }
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async getStagedFiles(): Promise<string[]> {
    try {
      const result = await this.git.raw(['diff', '--cached', '--name-only']);
      return result.split('\n').filter(f => f.trim());
    } catch { return []; }
  }

  async commit(message: string): Promise<CommitResult> {
    try {
      const r = await this.git.commit(message);
      return {
        success: true,
        hash: r.commit ?? null,
        message: `${r.summary?.changes ?? 0} changes`,
      };
    } catch (e: any) {
      return { success: false, hash: null, message: 'Commit failed', error: this.normalizeGitError(e) };
    }
  }

  async push(remote: string = 'origin', branch?: string): Promise<PushResult> {
    try {
      const remotes = await this.git.getRemotes(true);
      const remoteExists = remotes.some((r) => r.name === remote);
      if (!remoteExists) {
        return {
          success: false, pushed: false,
          error: 'ORIGIN_MISSING:No GitHub repository linked',
          nonFastForward: false,
        };
      }
    } catch (e: any) {
      const error = this.normalizeGitError(e);
      return {
        success: false, pushed: false,
        error: this.isKnownEnvironmentError(error) ? error : 'ORIGIN_MISSING:The current directory is not a Git repository',
        nonFastForward: false,
      };
    }

    let target = branch ?? (await this.getCurrentBranch());

    try {
      await this.git.raw(['rev-parse', '--verify', target]);
    } catch {
      const fallback = await this.getCurrentBranch();
      if (fallback && fallback !== 'HEAD') {
        target = fallback;
      } else {
        return {
          success: false, pushed: false,
          error: `The local branch "${branch ?? target}" does not exist. Please create an initial commit first (git commit).`,
          nonFastForward: false,
        };
      }
    }

    try {
      await this.git.fetch(remote);
      const s = await this.git.status();
      if (s.behind > 0) {
        return { success: false, pushed: false, error: 'The remote has new commits, please run Sync first', nonFastForward: true };
      }
      const r = await this.git.push(remote, target);
      return { success: true, pushed: r.pushed?.length > 0 && !r.pushed[0]?.alreadyUpdated };
    } catch (e: any) {
      const msg = this.normalizeGitError(e);
      const nff = msg.includes('non-fast-forward') || msg.includes('rejected');

      if (this.isKnownEnvironmentError(msg)) {
        return { success: false, pushed: false, error: msg, nonFastForward: false };
      }
      if (msg.includes('Connection was reset') || msg.includes('Connection reset')) {
        return { success: false, pushed: false, error: 'NETWORK_RESET:The network connection was reset. Please check your network or try again later.', nonFastForward: false };
      }
      if (msg.includes('unable to access') || msg.includes('Could not resolve host')) {
        return { success: false, pushed: false, error: 'NETWORK_UNREACHABLE:Unable to reach GitHub. Please check your network connection.', nonFastForward: false };
      }
      if (msg.includes('timeout') || msg.includes('timed out')) {
        return { success: false, pushed: false, error: 'NETWORK_TIMEOUT:Timed out connecting to GitHub. Please check your network or proxy settings.', nonFastForward: false };
      }
      if (msg.includes('Recv failure')) {
        return { success: false, pushed: false, error: 'NETWORK_RESET:The network connection was reset. Please check your network or try again later.', nonFastForward: false };
      }

      return { success: false, pushed: false, error: msg, nonFastForward: nff };
    }
  }

  async pull(remote?: string, branch?: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.pull(remote, branch); return { success: true }; }
    catch (e: any) { return { success: false, error: this.normalizeGitError(e) }; }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const b = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return b.trim();
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async getLatestCommitHash(): Promise<string | null> {
    try { const log = await this.git.log({ maxCount: 1 }); return log.latest?.hash ?? null; }
    catch { return null; }
  }

  async getRemoteUrl(remote?: string): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const r = remotes.find((r) => r.name === (remote ?? 'origin'));
      return r?.refs.fetch ?? null;
    } catch { return null; }
  }

  async listBranches(): Promise<string[]> {
    try {
      const b = await this.git.branchLocal();
      return b.all;
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async checkout(branch: string): Promise<void> {
    try {
      await this.git.checkout(branch);
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async addRemote(name: string, url: string): Promise<void> {
    try {
      const remotes = await this.git.getRemotes(true);
      if (remotes.some((r) => r.name === name)) {
        await this.git.remote(['set-url', name, url]);
      } else {
        await this.git.addRemote(name, url);
      }
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  async ensureAuthorIdentity(name: string, email: string, force = false): Promise<void> {
    try {
      const currentName = await this.getConfigValue('user.name');
      const currentEmail = await this.getConfigValue('user.email');

      if (force || !currentName) {
        await this.git.raw(['config', 'user.name', name]);
      }
      if (force || !currentEmail) {
        await this.git.raw(['config', 'user.email', email]);
      }
    } catch (e: any) {
      throw new Error(this.normalizeGitError(e));
    }
  }

  private resolveGitBinary(): string {
    const configured = [
      vscode.workspace.getConfiguration('gitpilot').get<string>('git.path'),
      vscode.workspace.getConfiguration('git').get<string>('path'),
      process.env.GIT_PILOT_GIT_PATH,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map(value => this.stripShellQuotes(value.trim()));

    const candidates = this.expandGitCandidates([
      ...configured,
      ...this.getPathGitCandidates(),
      ...this.getCommonGitCandidates(),
      'git',
    ]);
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      if (this.isUsableGit(candidate)) {
        return candidate;
      }
    }

    return configured[0] ?? 'git';
  }

  private getPathGitCandidates(): string[] {
    const names = process.platform === 'win32' ? ['git.exe', 'git.cmd', 'git.bat'] : ['git'];
    return (process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .flatMap(dir => names.map(name => path.join(dir, name)));
  }

  private getCommonGitCandidates(): string[] {
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA;
      return [
        'C:\\Progra~1\\Git\\cmd\\git.exe',
        'C:\\Progra~1\\Git\\bin\\git.exe',
        'C:\\Progra~2\\Git\\cmd\\git.exe',
        'C:\\Progra~2\\Git\\bin\\git.exe',
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files\\Git\\bin\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\bin\\git.exe',
        ...(localAppData ? [
          path.join(localAppData, 'Programs\\Git\\cmd\\git.exe'),
          path.join(localAppData, 'Programs\\Git\\bin\\git.exe'),
        ] : []),
      ];
    }

    if (process.platform === 'darwin') {
      return ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];
    }

    return ['/usr/bin/git', '/usr/local/bin/git'];
  }

  private isUsableGit(candidate: string): boolean {
    if (this.looksLikePath(candidate) && !fs.existsSync(candidate)) {
      return false;
    }

    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    return !result.error && result.status === 0;
  }

  private expandGitCandidates(candidates: string[]): string[] {
    return candidates.flatMap(candidate => [...this.getSafePathAliases(candidate), candidate]);
  }

  private getSafePathAliases(candidate: string): string[] {
    if (process.platform !== 'win32') return [];

    return [
      candidate.replace(/^([a-z]:)\\Program Files\\/i, '$1\\Progra~1\\'),
      candidate.replace(/^([a-z]:)\\Program Files \(x86\)\\/i, '$1\\Progra~2\\'),
    ].filter(alias => alias !== candidate);
  }

  private stripShellQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  private getSimpleGitOptions(): Partial<SimpleGitOptions> {
    return {
      binary: this.gitBinary,
      unsafe: {
        allowUnsafeCustomBinary: this.hasRestrictedBinaryCharacters(this.gitBinary),
      },
    };
  }

  private looksLikePath(candidate: string): boolean {
    return path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\');
  }

  private hasRestrictedBinaryCharacters(candidate: string): boolean {
    return !/^([a-z]:)?([a-z0-9/.\\_~-]+)$/i.test(candidate);
  }

  private async getConfigValue(key: string): Promise<string | null> {
    try {
      const value = await this.git.raw(['config', '--get', key]);
      const trimmed = value.trim();
      return trimmed || null;
    } catch {
      return null;
    }
  }

  private normalizeGitError(error: any): string {
    const message = error?.message ? String(error.message) : String(error ?? '');
    const code = error?.code ? String(error.code) : '';
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('not a git repository') ||
      lowerMessage.includes('not in a git directory') ||
      lowerMessage.includes('outside repository')
    ) {
      return `${NOT_GIT_REPO_PREFIX}The current folder is not a Git repository yet. Please create or link a GitHub repository first; GitPilot will initialize local Git automatically.`;
    }

    if (
      lowerMessage.includes('author identity unknown') ||
      lowerMessage.includes('please tell me who you are') ||
      lowerMessage.includes('unable to auto-detect email address')
    ) {
      return `${GIT_AUTHOR_MISSING_PREFIX}The Git commit author identity is not configured. Please set user.name and user.email and retry.`;
    }

    if (
      code === 'ENOENT' ||
      message.includes('ENOENT') ||
      message.includes('spawn git') ||
      message.includes('cannot find') ||
      message.includes('not found')
    ) {
      return `${GIT_NOT_FOUND_PREFIX}Git executable not found (currently trying: ${this.gitBinary}). Please make sure Git is installed, or point the VS Code settings gitpilot.git.path / git.path to git.exe.`;
    }

    return message || 'Git execution failed';
  }

  private isKnownEnvironmentError(message: string): boolean {
    return message.startsWith(GIT_NOT_FOUND_PREFIX)
      || message.startsWith(NOT_GIT_REPO_PREFIX)
      || message.startsWith(GIT_AUTHOR_MISSING_PREFIX);
  }
}
