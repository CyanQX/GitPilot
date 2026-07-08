// ============================================================
// IDeployOrchestrator — 部署编排器
// 这是用户看到的 "Deploy" 按钮背后调用的统一入口
// Core 只定义接口，不包含任何平台特定逻辑
// ============================================================

import type { DeployConfig, DeployResult, DeployStep, DeployStatus } from '../models/deploy';

export interface IDeployOrchestrator {
  /** 执行完整部署流程 */
  deploy(commitMessage?: string): Promise<DeployResult>;

  /** 执行同步（Pull + Push） */
  sync(): Promise<DeployResult>;

  /** 检查是否有待部署的变更 */
  hasPendingChanges(): Promise<boolean>;

  /** 获取当前状态 */
  getStatus(): DeployStatus;

  /** 监听步骤变化（供 UI 更新） */
  onStepChange(callback: (status: DeployStatus, step: DeployStep) => void): void;
}
