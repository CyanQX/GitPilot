// ============================================================
// GitHubRepositoryProvider — implements IRepositoryProvider
// ============================================================

import type { IRepositoryProvider } from '@gitpilot/core';
import type { Repository, Branch, CreateRepoOptions } from '@gitpilot/core';
import { Octokit } from '@octokit/rest';
import { Logger } from '@gitpilot/core';

export class GitHubRepositoryProvider implements IRepositoryProvider {
  readonly platform = 'github';
  private logger = new Logger('GitHubRepo');

  constructor(private octokit: Octokit) {}

  async listRepos(): Promise<Repository[]> {
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated', per_page: 100,
    });
    return data.map((r: any) => this.mapRepo(r));
  }

  async getRepo(owner: string, repo: string): Promise<Repository> {
    const { data } = await this.octokit.rest.repos.get({ owner, repo });
    return this.mapRepo(data);
  }

  async createRepo(options: CreateRepoOptions): Promise<Repository> {
    const { data } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name: options.name,
      description: options.description,
      private: options.private ?? false,
      auto_init: options.autoInit ?? true,
    });
    return this.mapRepo(data);
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.octokit.rest.repos.delete({ owner, repo });
    this.logger.warn(`Repository deleted: ${owner}/${repo}`);
  }

  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    const { data } = await this.octokit.rest.repos.listBranches({ owner, repo });
    return data.map((b: any) => ({
      name: b.name,
      commitSha: b.commit.sha,
      protected: b.protected,
    }));
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const r = await this.getRepo(owner, repo);
    return r.defaultBranch;
  }

  async checkRemoteAhead(owner: string, repo: string, localBranch: string): Promise<number> {
    try {
      const { data } = await this.octokit.rest.repos.getCommit({
        owner, repo, ref: `heads/${localBranch}`,
      });
      // Simplified implementation: compare the remote HEAD with the local one
      // (the real comparison must happen at the Git layer)
      return 0; // Remote check is delegated to the Git Provider's fetch logic
    } catch {
      return 0;
    }
  }

  private mapRepo(data: any): Repository {
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      private: data.private,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      defaultBranch: data.default_branch,
      description: data.description,
      language: data.language,
    };
  }
}
