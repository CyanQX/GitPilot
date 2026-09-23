// ============================================================
// IRepositoryProvider — repository management abstraction
// Every Git hosting platform must implement this interface
// ============================================================

import type { Repository, Branch, CreateRepoOptions } from '../models/repository';

export interface IRepositoryProvider {
  /** Platform identifier (used for logging and UI display) */
  readonly platform: string;

  /** List all repositories of the current user */
  listRepos(): Promise<Repository[]>;

  /** Get details of a specific repository */
  getRepo(owner: string, repo: string): Promise<Repository>;

  /** Create a new repository */
  createRepo(options: CreateRepoOptions): Promise<Repository>;

  /** Delete a repository */
  deleteRepo(owner: string, repo: string): Promise<void>;

  /** List repository branches */
  listBranches(owner: string, repo: string): Promise<Branch[]>;

  /** Get the default branch */
  getDefaultBranch(owner: string, repo: string): Promise<string>;

  /** Check whether the remote has new commits the local repo lacks (returns the number of commits ahead) */
  checkRemoteAhead(owner: string, repo: string, localBranch: string): Promise<number>;
}
