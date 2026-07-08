// ============================================================
// IBuildProvider — 构建抽象
// 不猜测语言，用户自己写命令。插件只负责执行。
// ============================================================

export interface BuildConfig {
  /** 用户自定义的构建命令（如 npm run build） */
  command: string;
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（ms），默认 5 分钟 */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
}

export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
}

export interface IBuildProvider {
  /** 执行构建命令（用户自定义，不猜测语言） */
  runBuild(config: BuildConfig): Promise<BuildResult>;
}
