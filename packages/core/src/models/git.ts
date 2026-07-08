// ============================================================
// Git 操作数据模型
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
  /** 是否因为 non-fast-forward 被拒绝 */
  nonFastForward?: boolean;
}
