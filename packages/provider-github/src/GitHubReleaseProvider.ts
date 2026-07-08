// ============================================================
// GitHubReleaseProvider — 实现 IReleaseProvider
// ============================================================

import type { IReleaseProvider } from '@gitpilot/core';
import type { Release, ReleaseAsset, CreateReleaseOptions } from '@gitpilot/core';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@gitpilot/core';

export class GitHubReleaseProvider implements IReleaseProvider {
  readonly platform = 'github';
  private logger = new Logger('GitHubRelease');

  constructor(private octokit: Octokit) {}

  async createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<Release> {
    const { data } = await this.octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: options.tagName,
      name: options.name ?? options.tagName,
      body: options.body ?? '',
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? false,
      target_commitish: options.targetCommitish,
    });
    return this.mapRelease(data);
  }

  async listReleases(owner: string, repo: string): Promise<Release[]> {
    const { data } = await this.octokit.rest.repos.listReleases({ owner, repo });
    return data.map((r: any) => this.mapRelease(r));
  }

  async getLatestRelease(owner: string, repo: string): Promise<Release | null> {
    try {
      const { data } = await this.octokit.rest.repos.getLatestRelease({ owner, repo });
      return this.mapRelease(data);
    } catch {
      return null;
    }
  }

  async uploadAsset(
    owner: string,
    repo: string,
    releaseId: number,
    filePath: string,
    fileName?: string,
  ): Promise<ReleaseAsset> {
    const content = fs.readFileSync(filePath);
    const name = fileName ?? path.basename(filePath);

    const { data } = await this.octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name,
      data: content as unknown as string,
      headers: { 'content-type': 'application/octet-stream' },
    });

    return {
      id: data.id,
      name: data.name,
      size: data.size,
      downloadCount: data.download_count,
      browserDownloadUrl: data.browser_download_url,
      contentType: data.content_type,
    };
  }

  async deleteRelease(owner: string, repo: string, releaseId: number): Promise<void> {
    await this.octokit.rest.repos.deleteRelease({ owner, repo, release_id: releaseId });
  }

  private mapRelease(data: any): Release {
    return {
      id: data.id,
      tagName: data.tag_name,
      name: data.name ?? data.tag_name,
      body: data.body ?? '',
      draft: data.draft,
      prerelease: data.prerelease,
      htmlUrl: data.html_url,
      assets: (data.assets ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        downloadCount: a.download_count,
        browserDownloadUrl: a.browser_download_url,
        contentType: a.content_type,
      })),
      createdAt: data.created_at,
      publishedAt: data.published_at,
    };
  }
}
