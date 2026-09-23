// ============================================================
// Git operations data models
// ============================================================

export interface GitStatus {
  isClean: boolean;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  staged: string[];
  currentBranch: string;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface CommitResult {
  success: boolean;
  hash: string | null;
  message: string;
  error?: string;
}

export interface PushResult {
  success: boolean;
  pushed: boolean;
  error?: string;
  /** Whether the push was rejected because of non-fast-forward */
  nonFastForward?: boolean;
}
