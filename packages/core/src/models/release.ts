// ============================================================
// Release data models
// ============================================================

export interface Release {
  id: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  htmlUrl: string;
  assets: ReleaseAsset[];
  createdAt: string;
  publishedAt: string | null;
}

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
  contentType: string;
}

export interface CreateReleaseOptions {
  tagName: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
}
