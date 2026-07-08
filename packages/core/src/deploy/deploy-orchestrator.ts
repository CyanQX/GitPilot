// ============================================================
// DeployOrchestrator — 核心部署编排器
// 
// 这是 GitPilot 的大脑。
// 它不依赖 GitHub、不依赖 VS Code、不依赖 IntelliJ。
// 它只依赖接口。所有平台通过实现接口来接入。
//
// 流程：检查变更 → 过滤 → Build(可选) → 检查远端 →
//       Stage → Commit → Push → Release(可选)
//
// 原则：Build 失败、推送冲突时一律中止并提示
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
  //  核心部署流程
  // ================================================================

  async deploy(commitMessage?: string): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];
    const message = commitMessage ?? this.config.commitMessageTemplate ?? 'deploy: auto-deploy by GitPilot';

    try {
      // ── Step 1: 检查变更 ──
      const stepCheck = this.createStep('检查文件变更');
      this.emit('staging', stepCheck);

      const hasChanges = await this.gitProvider.hasChanges();
      const gitStatus = await this.gitProvider.getStatus();
      const hasUnpushedCommits = (gitStatus.ahead ?? 0) > 0;

      // ⭐ 既没有文件变更，也没有未推送的提交 → 跳过
      if (!hasChanges && !hasUnpushedCommits) {
        stepCheck.status = 'skipped';
        stepCheck.details = '没有需要部署的变更';
        this.finishStep(stepCheck);
        steps.push(stepCheck);
        this.currentStatus = 'no-changes';
        return { success: true, status: 'no-changes', steps, totalDurationMs: Date.now() - startTime };
      }

      // ⭐ 有未推送提交但无文件变更 → 跳过暂存/提交，直接推送
      if (!hasChanges && hasUnpushedCommits) {
        stepCheck.status = 'success';
        stepCheck.details = `无新变更，但 ${gitStatus.ahead} 个提交未推送`;
        this.finishStep(stepCheck);
        steps.push(stepCheck);

        // 直接跳到推送
        const stepPush = this.createStep('推送到远端');
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
            error: `推送失败: ${pushResult.error}`,
            totalDurationMs: Date.now() - startTime,
          };
        }
        stepPush.status = 'success';
        stepPush.details = '已推送';
        this.finishStep(stepPush);
        steps.push(stepPush);
        this.currentStatus = 'success';
        return { success: true, status: 'success', steps, totalDurationMs: Date.now() - startTime };
      }

      stepCheck.status = 'success';
      this.finishStep(stepCheck);
      steps.push(stepCheck);

      // ── Step 2: 智能过滤 ──
      const stepFilter = this.createStep('智能文件过滤');
      this.emit('staging', stepFilter);

      const allChanged = [
        ...gitStatus.modified,
        ...gitStatus.added,
        ...gitStatus.deleted,
        ...gitStatus.untracked,
      ];
      const filterResult = this.smartFilter.filter(allChanged);

      if (filterResult.blocked.length > 0) {
        this.logger.warn(`过滤了 ${filterResult.blocked.length} 个文件`);
      }
      stepFilter.status = 'success';
      stepFilter.details = `${filterResult.allowed.length} 个文件待部署`;
      if (filterResult.blocked.length > 0) {
        stepFilter.details += `，已过滤 ${filterResult.blocked.length} 个`;
      }
      this.finishStep(stepFilter);
      steps.push(stepFilter);

      // ── Step 3: Build（可选）──
      if (this.config.buildBeforeDeploy && this.config.buildCommand) {
        const stepBuild = this.createStep('构建项目');
        this.emit('building', stepBuild);

        const buildResult = await this.buildProvider.runBuild({
          command: this.config.buildCommand,
          timeout: 5 * 60 * 1000,
        });

        if (!buildResult.success) {
          stepBuild.status = 'failed';
          stepBuild.error = buildResult.error ?? 'Build 失败';
          this.finishStep(stepBuild);
          stepBuild.durationMs = buildResult.durationMs;
          steps.push(stepBuild);

          if (this.config.blockOnBuildFailure) {
            this.currentStatus = 'failed';
            return {
              success: false, status: 'failed', steps,
              error: `Build 失败: ${buildResult.error}`,
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

      // ── Step 4: 检查远端状态 ──
      const stepRemote = this.createStep('检查远端状态');
      this.emit('staging', stepRemote);

      const branch = this.config.branch;
      const aheadCount = await this.repoProvider.checkRemoteAhead(
        this.config.repo.owner,
        this.config.repo.name,
        branch,
      );

      if (aheadCount > 0) {
        stepRemote.status = 'failed';
        stepRemote.error = `远端领先 ${aheadCount} 个提交，请先执行 Sync`;
        this.finishStep(stepRemote);
        steps.push(stepRemote);
        this.currentStatus = 'failed';
        return {
          success: false, status: 'failed', steps,
          error: '远端有新提交（non-fast-forward），已中止推送。请先执行 Sync。',
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepRemote.status = 'success';
      stepRemote.details = '远端状态正常';
      this.finishStep(stepRemote);
      steps.push(stepRemote);

      // ── Step 5: 暂存 ──
      const stepStage = this.createStep('暂存文件');
      this.emit('staging', stepStage);
      // ⭐ git add -A 全部 → 排除 blocked 文件（密钥/构建产物等）
      await this.gitProvider.stageFiles(filterResult.blocked.map((b) => b.file));
      // ⭐ 验证暂存结果
      const stagedFiles = await this.gitProvider.getStagedFiles();
      stepStage.status = 'success';
      stepStage.details = stagedFiles.length > 0
        ? `已暂存 ${stagedFiles.length} 个文件`
        : `${filterResult.allowed.length} 个文件待提交`;
      if (filterResult.blocked.length > 0) {
        stepStage.details += `，已排除 ${filterResult.blocked.length} 个`;
      }
      this.finishStep(stepStage);
      steps.push(stepStage);

      // 如果没有文件被暂存，跳过提交
      if (stagedFiles.length === 0 && filterResult.allowed.length === 0) {
        this.currentStatus = 'no-changes';
        return { success: true, status: 'no-changes', steps, totalDurationMs: Date.now() - startTime };
      }

      // ── Step 6: 提交 ──
      const stepCommit = this.createStep('提交变更');
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
          error: `提交失败: ${commitResult.error}`,
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepCommit.status = 'success';
      stepCommit.details = `${commitResult.hash?.substring(0, 7)} - ${message}`;
      this.finishStep(stepCommit);
      steps.push(stepCommit);

      // ── Step 7: 推送 ──
      const stepPush = this.createStep('推送到远端');
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
            ? '推送冲突：远端有新提交，请先执行 Sync'
            : `推送失败: ${pushResult.error}`,
          totalDurationMs: Date.now() - startTime,
        };
      }
      stepPush.status = 'success';
      stepPush.details = pushResult.pushed ? '已推送' : '远端已是最新';
      this.finishStep(stepPush);
      steps.push(stepPush);

      // ── Step 8: Release（可选）──
      let releaseUrl: string | undefined;
      if (this.config.release?.enabled) {
        const stepRelease = this.createStep('创建 Release');
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
          this.logger.warn(`Release 创建失败（不阻塞部署）: ${error.message}`);
        }
      }

      // ── 完成 ──
      this.currentStatus = 'success';
      const totalMs = Date.now() - startTime;
      this.logger.info(`部署完成，耗时 ${(totalMs / 1000).toFixed(1)}s`);

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
      this.logger.error(`部署异常: ${error.message}`);
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
  //  同步流程
  // ================================================================

  async sync(): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];

    try {
      const stepPull = this.createStep('拉取远端更新');
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
  //  内部方法
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
