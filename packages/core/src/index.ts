// ============================================================
// @gitpilot/core — 统一导出
//
// Core 只导出三样东西：
//   1. Interfaces  — 抽象接口（平台无关）
//   2. Models      — 纯数据类型
//   3. Orchestrator — 部署编排器（依赖接口，不依赖平台）
//
// Core 不包含：
//   ❌ GitHub API（那是 Provider 的事）
//   ❌ VS Code API（那是 extension 的事）
//   ❌ IntelliJ API（那是 plugin 的事）
//   ❌ 任何平台特定的 import
// ============================================================

// ── Interfaces ──
export type { IRepositoryProvider } from './interfaces/IRepositoryProvider';
export type { IAuthProvider } from './interfaces/IAuthProvider';
export type { IReleaseProvider } from './interfaces/IReleaseProvider';
export type { IGitProvider } from './interfaces/IGitProvider';
export type { IBuildProvider, BuildConfig, BuildResult } from './interfaces/IBuildProvider';
export type { ISecretStorage } from './interfaces/ISecretStorage';
export type {
  INotificationProvider,
  NotificationType,
  NotificationAction,
  NotificationPayload,
} from './interfaces/INotificationProvider';
export type {
  IFileWatcherProvider,
  FileChangeEvent,
  WatchConfig,
  FileChangeCallback,
} from './interfaces/IFileWatcherProvider';
export type { IDeployOrchestrator } from './interfaces/IDeployOrchestrator';

// ── Models ──
export type { Repository, Branch, CreateRepoOptions } from './models/repository';
export type { UserInfo, AuthToken, StoredAccount } from './models/auth';
export type { GitStatus, CommitResult, PushResult } from './models/git';
export type {
  DeployTrigger,
  DeployStatus,
  DeployStep,
  DeployConfig,
  DeployResult,
} from './models/deploy';
export type {
  Release,
  ReleaseAsset,
  CreateReleaseOptions,
} from './models/release';

// ── Orchestrator ──
export { DeployOrchestrator } from './deploy/deploy-orchestrator';

// ── Security ──
export { SmartFilter } from './security/smart-filter';
export type { FilterResult } from './security/smart-filter';
export { SecretDetector } from './security/secret-detector';
export type { SecretMatch } from './security/secret-detector';
export { TokenManager } from './security/token-manager';

// ── Utils ──
export { Logger, LogLevel } from './utils/logger';
export type { LogEntry } from './utils/logger';
