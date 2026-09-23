// ============================================================
// IDeployOrchestrator — deploy orchestrator
// This is the unified entry point invoked behind the "Deploy" button
// Core only defines the interface and contains no platform-specific logic
// ============================================================

import type { DeployConfig, DeployResult, DeployStep, DeployStatus } from '../models/deploy';

export interface IDeployOrchestrator {
  /** Run the full deploy flow */
  deploy(commitMessage?: string): Promise<DeployResult>;

  /** Run sync (Pull + Push) */
  sync(): Promise<DeployResult>;

  /** Check whether there are pending changes to deploy */
  hasPendingChanges(): Promise<boolean>;

  /** Get the current status */
  getStatus(): DeployStatus;

  /** Listen for step changes (used by the UI to update) */
  onStepChange(callback: (status: DeployStatus, step: DeployStep) => void): void;
}
