// ============================================================
// IBuildProvider — build abstraction
// No language guessing; the user provides the command and the
// plugin only executes it.
// ============================================================

export interface BuildConfig {
  /** User-defined build command (e.g. npm run build) */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Timeout in ms; defaults to 5 minutes */
  timeout?: number;
  /** Environment variables */
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
  /** Run the build command (user-defined, no language guessing) */
  runBuild(config: BuildConfig): Promise<BuildResult>;
}
