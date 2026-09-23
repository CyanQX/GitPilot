// ============================================================
// IGitProvider — Git operations abstraction
// Each platform uses its own implementation (VS Code → simple-git, JetBrains → Git4Idea)
// ============================================================

import type { GitStatus, CommitResult, PushResult } from '../models/git';

export interface IGitProvider {
  /** Check whether this is a Git repository */
  isRepo(): Promise<boolean>;

  /** Initialize the repository */
  init(): Promise<void>;

  /** Get the working tree status */
  getStatus(): Promise<GitStatus>;

  /** Whether there are uncommitted changes */
  hasChanges(): Promise<boolean>;

  /** Stage all files, excluding the given ones (secrets/build artifacts, etc.) */
  stageFiles(excludeFiles?: string[]): Promise<void>;

  /** Get the list of currently staged files */
  getStagedFiles(): Promise<string[]>;

  /** Commit */
  commit(message: string): Promise<CommitResult>;

  /** Push (must check the remote first and reject non-fast-forward) */
  push(remote?: string, branch?: string): Promise<PushResult>;

  /** Pull */
  pull(remote?: string, branch?: string): Promise<{ success: boolean; error?: string }>;

  /** Get the current branch */
  getCurrentBranch(): Promise<string>;

  /** Get the latest commit hash */
  getLatestCommitHash(): Promise<string | null>;

  /** Get the remote URL */
  getRemoteUrl(remote?: string): Promise<string | null>;

  /** List local branches */
  listBranches(): Promise<string[]>;

  /** Check out a branch */
  checkout(branch: string): Promise<void>;

  /** Add a remote */
  addRemote(name: string, url: string): Promise<void>;
}
