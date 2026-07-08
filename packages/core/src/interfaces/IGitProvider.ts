// ============================================================
// IGitProvider — Git 操作抽象
// 不同平台用不同实现（VS Code → simple-git，JetBrains → Git4Idea）
// ============================================================

import type { GitStatus, CommitResult, PushResult } from '../models/git';

export interface IGitProvider {
  /** 检查是否为 Git 仓库 */
  isRepo(): Promise<boolean>;

  /** 初始化仓库 */
  init(): Promise<void>;

  /** 获取工作区状态 */
  getStatus(): Promise<GitStatus>;

  /** 是否有未提交的变更 */
  hasChanges(): Promise<boolean>;

  /** 暂存所有文件，排除指定文件（密钥/构建产物等） */
  stageFiles(excludeFiles?: string[]): Promise<void>;

  /** 获取当前已暂存的文件列表 */
  getStagedFiles(): Promise<string[]>;

  /** 提交 */
  commit(message: string): Promise<CommitResult>;

  /** 推送（必须先检查远端，拒绝 non-fast-forward） */
  push(remote?: string, branch?: string): Promise<PushResult>;

  /** 拉取 */
  pull(remote?: string, branch?: string): Promise<{ success: boolean; error?: string }>;

  /** 获取当前分支 */
  getCurrentBranch(): Promise<string>;

  /** 获取最新提交哈希 */
  getLatestCommitHash(): Promise<string | null>;

  /** 获取远端 URL */
  getRemoteUrl(remote?: string): Promise<string | null>;

  /** 列出本地分支 */
  listBranches(): Promise<string[]>;

  /** 切换分支 */
  checkout(branch: string): Promise<void>;

  /** 添加远端 */
  addRemote(name: string, url: string): Promise<void>;
}
