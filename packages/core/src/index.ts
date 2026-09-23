// ============================================================
// @gitpilot/core — unified exports
//
// Core exports only three things:
//   1. Interfaces   — abstract interfaces (platform-agnostic)
//   2. Models       — pure data types
//   3. Orchestrator — deploy orchestrator (depends on interfaces, not platforms)
//
// Core does NOT contain:
//   ❌ GitHub API (that's the Provider's job)
//   ❌ VS Code API (that's the extension's job)
//   ❌ IntelliJ API (that's the plugin's job)
//   ❌ any platform-specific imports
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
