// ============================================================
// Repository data models
// ============================================================

export interface Repository {
  id: number;
  name: string;
  fullName: string;        // owner/name
  owner: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string | null;
  language: string | null;
}

export interface Branch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}
