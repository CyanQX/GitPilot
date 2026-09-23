// ============================================================
// IReleaseProvider — Release publishing abstraction
// ============================================================

import type { Release, ReleaseAsset, CreateReleaseOptions } from '../models/release';

export interface IReleaseProvider {
  /** Platform identifier */
  readonly platform: string;

  /** Create a Release */
  createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<Release>;

  /** List all Releases of a repository */
  listReleases(owner: string, repo: string): Promise<Release[]>;

  /** Get the latest Release */
  getLatestRelease(owner: string, repo: string): Promise<Release | null>;

  /** Upload a Release asset */
  uploadAsset(
    owner: string,
    repo: string,
    releaseId: number,
    filePath: string,
    fileName?: string,
  ): Promise<ReleaseAsset>;

  /** Delete a Release */
  deleteRelease(owner: string, repo: string, releaseId: number): Promise<void>;
}
