// ============================================================
// IReleaseProvider — Release 发布抽象
// ============================================================

import type { Release, ReleaseAsset, CreateReleaseOptions } from '../models/release';

export interface IReleaseProvider {
  /** 平台标识 */
  readonly platform: string;

  /** 创建 Release */
  createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<Release>;

  /** 列出仓库所有 Release */
  listReleases(owner: string, repo: string): Promise<Release[]>;

  /** 获取最新 Release */
  getLatestRelease(owner: string, repo: string): Promise<Release | null>;

  /** 上传 Release 资产 */
  uploadAsset(
    owner: string,
    repo: string,
    releaseId: number,
    filePath: string,
    fileName?: string,
  ): Promise<ReleaseAsset>;

  /** 删除 Release */
  deleteRelease(owner: string, repo: string, releaseId: number): Promise<void>;
}
