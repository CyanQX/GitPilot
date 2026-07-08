// ============================================================
// IRepositoryProvider — 仓库管理抽象
// 所有 Git 托管平台必须实现此接口
// ============================================================

import type { Repository, Branch, CreateRepoOptions } from '../models/repository';

export interface IRepositoryProvider {
  /** 平台标识（用于日志和 UI 展示） */
  readonly platform: string;

  /** 列出当前用户的所有仓库 */
  listRepos(): Promise<Repository[]>;

  /** 获取指定仓库详情 */
  getRepo(owner: string, repo: string): Promise<Repository>;

  /** 创建新仓库 */
  createRepo(options: CreateRepoOptions): Promise<Repository>;

  /** 删除仓库 */
  deleteRepo(owner: string, repo: string): Promise<void>;

  /** 列出仓库分支 */
  listBranches(owner: string, repo: string): Promise<Branch[]>;

  /** 获取默认分支 */
  getDefaultBranch(owner: string, repo: string): Promise<string>;

  /** 检测远端是否有本地没有的新提交（返回领先的提交数） */
  checkRemoteAhead(owner: string, repo: string, localBranch: string): Promise<number>;
}
