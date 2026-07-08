// ============================================================
// 部署相关数据模型
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
  /** 目标仓库 */
  repo: { owner: string; name: string; fullName: string };
  /** 目标分支 */
  branch: string;
  /** 提交消息模板 */
  commitMessageTemplate?: string;
  /** 触发模式 */
  trigger: DeployTrigger;
  /** 是否部署前执行 build */
  buildBeforeDeploy?: boolean;
  /** build 失败时是否阻止部署 */
  blockOnBuildFailure?: boolean;
  /** 构建命令 */
  buildCommand?: string;
  /** Release 配置 */
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
