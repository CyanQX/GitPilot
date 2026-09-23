// ============================================================
// DeployOrchestrator — the core deploy orchestrator
//
// This is the brain of GitPilot.
// It does not depend on GitHub, VS Code, or IntelliJ.
// It only depends on interfaces. Every platform plugs in by
// implementing those interfaces.
//
// Flow: check changes → filter → Build (optional) → check remote →
//       Stage → Commit → Push → Release (optional)
//
// Principle: on build failure or push conflict, always abort and report
// ============================================================

import type { IDeployOrchestrator } from '../interfaces/IDeployOrchestrator';
import type { IRepositoryProvider } from '../interfaces/IRepositoryProvider';
import type { IGitProvider } from '../interfaces/IGitProvider';
import type { IBuildProvider } from '../interfaces/IBuildProvider';
import type { IReleaseProvider } from '../interfaces/IReleaseProvider';
import type { INotificationProvider } from '../interfaces/INotificationProvider';
import type { DeployConfig, DeployResult, DeployStep, DeployStatus } from '../models/deploy';
import { Logger } from '../utils/logger';

export class DeployOrchestrator implements IDeployOrchestrator {
  private logger = new Logger('Orchestrator');
  private currentStatus: DeployStatus = 'idle';
  private onStatusChange?: (status: DeployStatus, step: DeployStep) => void;

  constructor(
    private readonly config: DeployConfig,
    private readonly repoProvider: IRepositoryProvider,
    private readonly gitProvider: IGitProvider,
    private readonly buildProvider: IBuildProvider,
    private readonly releaseProvider: IReleaseProvider,
    private readonly notifier: INotificationProvider,
    private readonly smartFilter: { filter: (files: string[]) => { allowed: string[]; blocked: Array<{ file: string; reason: string }> } },
  ) {
    this.config = {
      commitMessageTemplate: 'deploy: auto-deploy by GitPilot',
      buildBeforeDeploy: false,
      blockOnBuildFailure: true,
      ...config,
    };
  }

  onStepChange(callback: (status: DeployStatus, step: DeployStep) => void): void {
    this.onStatusChange = callback;
  }

  getStatus(): DeployStatus {
    return this.currentStatus;
  }

  async hasPendingChanges(): Promise<boolean> {
    return this.gitProvider.hasChanges();
  }

  // ================================================================
  //  Core deploy flow
  // ================================================================

  async deploy(commitMessage?: string): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];
    const message = commitMessage ?? this.config.commitMessageTemplate ?? 'deploy: auto-deploy by GitPilot';

    try {
      // ── Step 1: Check for changes ──
      const stepCheck = this.createStep('Checking file changes');
      this.emit('staging', stepCheck);

      const hasChanges = await this.gitProvider.hasChanges();
      const gitStatus = await this.gitProvider.getStatus();
      const hasUnpushedCommits = (gitStatus.ahead ?? 0) > 0;

      // ⭐ Neither file changes nor unpushed commits → skip
      if (!hasChanges && !hasUnpushedCommits) {
        stepCheck.status = 'skipped';
        stepCheck.details = 'No changes to deploy';
        this.finishStep(stepCheck);
        steps.push(stepCheck);
        this.currentStatus = 'no-changes';
        return { success: true, status: 'no-changes', steps, totalDurationMs: Date.now() - startTime };
      }

      // ⭐ Unpushed commits but no file changes → skip staging/commit, push directly
      if (!hasChanges && hasUnpushedCommits) {
        stepCheck.status = 'success';
        stepCheck.details = `No new changes, but ${gitStatus.ahead} commit(s) not pushed`;
        this.finishStep(stepCheck);
        steps.push(stepCheck);

        // Jump straight to push
        const stepPush = this.createStep('Pushing to remote');
        this.emit('pushing', stepPush);
        const pushResult = await this.gitProvider.push('origin', this.config.branch);
        if (!pushResult.success) {
          stepPush.status = 'failed';
          stepPush.error = pushResult.error;
          this.finishStep(stepPush);
          steps.push(stepPush);
          this.currentStatus = 'failed';
          return {
            success: false, status: 'failed', steps,
            error: `Push failed: ${pushResult.error}`,
            totalDurationMs: Date.now() - startTime,
          };
        }
        stepPush.status = 'success';
        stepPush.details = 'Pushed';
        this.finishStep(stepPush);
        steps.push(stepPush);
        this.currentStatus = 'success';
        return { success: true, status: 'success', steps, totalDurationMs: Date.now() - startTime };
      }

      stepCheck.status = 'success';
      this.finishStep(stepCheck);
      steps.push(stepCheck);

      // ── Step 2: Smart filtering ──
      const stepFilter = this.createStep('Smart file filtering');
      this.emit('staging', stepFilter);

      const allChanged = [
        ...gitStatus.modified,
        ...gitStatus.added,
        ...gitStatus.deleted,
        ...gitStatus.untracked,
      ];
      const filterResult = this.smartFilter.filter(allChanged);

      if (filterResult.blocked.length > 0) {
        this.logger.warn(`Filtered out ${filterResult.blocked.length} file(s)`);
      }
      stepFilter.status = 'success';
      stepFilter.details = `${filterResult.allowed.length} file(s) to deploy`;
      if (filterResult.blocked.length > 0) {
        stepFilter.details += `, filtered out ${filterResult.blocked.length}`;
      }
      this.finishStep(stepFilter);
      steps.push(stepFilter);

      // ── Step 3: Build (optional) ──
      if (this.config.buildBeforeDeploy && this.config.buildCommand) {
        const stepBuild = this.createStep('Building project');
        this.emit('building', stepBuild);

        const buildResult = await this.buildProvider.runBuild({
          command: this.config.buildCommand,
          timeout: 5 * 60 * 1000,
        });

        if (!buildResult.success) {
          stepBuild.status = 'failed';
          stepBuild.error = buildResult.error ?? 'Build failed';
          this.finishStep(stepBuild);
          stepBuild.durationMs = buildResult.durationMs;
          steps.push(stepBuild);

          if (this.config.blockOnBuildFailure) {
            this.currentStatus = 'failed';
            return {
              success: false, status: 'failed', steps,
              error: `Build failed: ${buildResult.error}`,
              totalDurationMs: Date.now() - startTime,
            };
          }
        }

        stepBuild.status = 'success';
        stepBuild.details = buildResult.output?.slice(-200);
        this.finishStep(stepBuild);
        stepBuild.durationMs = buildResult.durationMs;
        steps.push(stepBuild);
      }

      // ── Step 4: Check remote status ──
      const stepRemote = this.createStep('Checking remote status');
      this.emit('staging', stepRemote);

      const branch = this.config.branch;
      const aheadCount = await this.repoProvider.checkRemoteAhead(
        this.config.repo.owner,
        this.config.repo.name,
        branch,
      );

      if (aheadCount > 0) {
        stepRemote.status = 'failed';
        stepRemote.error = `Remote is ahead by ${aheadCount} commit(s); please run Sync first`;
        this.finishStep(stepRemote);
        steps.push(stepRemote);
        this.currentStatus = 'failed';
        return {
          success: false, status: 'failed', steps,
          error: 'The remote has new commits (non-fast-forward); push aborted. Please run Sync first.',
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepRemote.status = 'success';
      stepRemote.details = 'Remote status OK';
      this.finishStep(stepRemote);
      steps.push(stepRemote);

      // ── Step 5: Stage ──
      const stepStage = this.createStep('Staging files');
      this.emit('staging', stepStage);
      // ⭐ git add -A everything → exclude blocked files (secrets/build artifacts, etc.)
      await this.gitProvider.stageFiles(filterResult.blocked.map((b) => b.file));
      // ⭐ Verify the staging result
      const stagedFiles = await this.gitProvider.getStagedFiles();
      stepStage.status = 'success';
      stepStage.details = stagedFiles.length > 0
        ? `Staged ${stagedFiles.length} file(s)`
        : `${filterResult.allowed.length} file(s) to commit`;
      if (filterResult.blocked.length > 0) {
        stepStage.details += `, excluded ${filterResult.blocked.length}`;
      }
      this.finishStep(stepStage);
      steps.push(stepStage);

      // If nothing was staged, skip the commit
      if (stagedFiles.length === 0 && filterResult.allowed.length === 0) {
        this.currentStatus = 'no-changes';
        return { success: true, status: 'no-changes', steps, totalDurationMs: Date.now() - startTime };
      }

      // ── Step 6: Commit ──
      const stepCommit = this.createStep('Committing changes');
      this.emit('committing', stepCommit);
      const commitResult = await this.gitProvider.commit(message);

      if (!commitResult.success) {
        stepCommit.status = 'failed';
        stepCommit.error = commitResult.error;
        this.finishStep(stepCommit);
        steps.push(stepCommit);
        this.currentStatus = 'failed';
        return {
          success: false, status: 'failed', steps,
          error: `Commit failed: ${commitResult.error}`,
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepCommit.status = 'success';
      stepCommit.details = `${commitResult.hash?.substring(0, 7)} - ${message}`;
      this.finishStep(stepCommit);
      steps.push(stepCommit);

      // ── Step 7: Push ──
      const stepPush = this.createStep('Pushing to remote');
      this.emit('pushing', stepPush);
      const pushResult = await this.gitProvider.push('origin', branch);

      if (!pushResult.success) {
        stepPush.status = 'failed';
        stepPush.error = pushResult.error;
        this.finishStep(stepPush);
        steps.push(stepPush);
        this.currentStatus = 'failed';
        return {
          success: false, status: 'failed', steps,
          commitHash: commitResult.hash ?? undefined,
          error: pushResult.nonFastForward
            ? 'Push conflict: the remote has new commits, please run Sync first'
            : `Push failed: ${pushResult.error}`,
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepPush.status = 'success';
      stepPush.details = pushResult.pushed ? 'Pushed' : 'Remote is already up to date';
      this.finishStep(stepPush);
      steps.push(stepPush);

      // ── Step 8: Release (optional) ──
      let releaseUrl: string | undefined;
      if (this.config.release?.enabled) {
        const stepRelease = this.createStep('Creating Release');
        this.emit('releasing', stepRelease);

        try {
          const tagName = this.generateTagName();
          const release = await this.releaseProvider.createRelease(
            this.config.repo.owner,
            this.config.repo.name,
            {
              tagName,
              name: tagName,
              prerelease: this.config.release.prerelease ?? false,
              draft: this.config.release.draft ?? false,
              targetCommitish: commitResult.hash ?? undefined,
            },
          );
          releaseUrl = release.htmlUrl;
          stepRelease.status = 'success';
          stepRelease.details = tagName;
          this.finishStep(stepRelease);
          steps.push(stepRelease);
        } catch (error: any) {
          stepRelease.status = 'failed';
          stepRelease.error = error.message;
          this.finishStep(stepRelease);
          steps.push(stepRelease);
          this.logger.warn(`Release creation failed (does not block the deploy): ${error.message}`);
        }
      }

      // ── Done ──
      this.currentStatus = 'success';
      const totalMs = Date.now() - startTime;
      this.logger.info(`Deploy finished in ${(totalMs / 1000).toFixed(1)}s`);

      return {
        success: true,
        status: 'success',
        steps,
        commitHash: commitResult.hash ?? undefined,
        releaseUrl,
        totalDurationMs: totalMs,
      };
    } catch (error: any) {
      this.currentStatus = 'failed';
      this.logger.error(`Deploy error: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        steps,
        error: error.message,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  // ================================================================
  //  Sync flow
  // ================================================================

  async sync(): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];

    try {
      const stepPull = this.createStep('Pulling remote updates');
      this.emit('idle', stepPull);

      const pullResult = await this.gitProvider.pull();
      stepPull.status = pullResult.success ? 'success' : 'failed';
      stepPull.error = pullResult.error;
      this.finishStep(stepPull);
      steps.push(stepPull);

      const deployResult = await this.deploy();
      steps.push(...deployResult.steps);

      return { ...deployResult, steps, totalDurationMs: Date.now() - startTime };
    } catch (error: any) {
      return {
        success: false, status: 'failed', steps,
        error: error.message,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  // ================================================================
  //  Internal helpers
  // ================================================================

  private createStep(name: string): DeployStep {
    return { name, status: 'running', startTime: new Date() };
  }

  private finishStep(step: DeployStep): void {
    step.endTime = new Date();
    if (step.startTime) {
      step.durationMs = step.endTime.getTime() - step.startTime.getTime();
    }
  }

  private emit(status: DeployStatus, step: DeployStep): void {
    this.currentStatus = status;
    this.onStatusChange?.(status, step);
  }

  private generateTagName(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `v${y}${m}${d}-${h}${min}`;
  }
}
