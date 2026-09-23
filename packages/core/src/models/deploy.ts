// ============================================================
// Deploy data models
// ============================================================

export type DeployTrigger =
  | 'manual'
  | 'on-save'
  | 'scheduled'
  | 'after-build'
  | 'on-exit'
  | 'on-startup';

export type DeployStatus =
  | 'idle'
  | 'building'
  | 'staging'
  | 'committing'
  | 'pushing'
  | 'releasing'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'no-changes';

export interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  durationMs?: number;
  error?: string;
  details?: string;
}

export interface DeployConfig {
  /** Target repository */
  repo: { owner: string; name: string; fullName: string };
  /** Target branch */
  branch: string;
  /** Commit message template */
  commitMessageTemplate?: string;
  /** Trigger mode */
  trigger: DeployTrigger;
  /** Whether to run a build before deploying */
  buildBeforeDeploy?: boolean;
  /** Whether to block the deploy when the build fails */
  blockOnBuildFailure?: boolean;
  /** Build command */
  buildCommand?: string;
  /** Release configuration */
  release?: {
    enabled: boolean;
    artifactPaths?: string[];
    autoGenerateNotes?: boolean;
    prerelease?: boolean;
    draft?: boolean;
  };
}

export interface DeployResult {
  success: boolean;
  status: DeployStatus;
  steps: DeployStep[];
  commitHash?: string;
  releaseUrl?: string;
  error?: string;
  totalDurationMs: number;
}
