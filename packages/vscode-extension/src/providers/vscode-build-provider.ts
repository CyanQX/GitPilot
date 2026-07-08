// ============================================================
// VSCodeBuildProvider — 实现 IBuildProvider
// 不猜测语言，只执行用户配置的命令
// ============================================================

import type { IBuildProvider, BuildConfig, BuildResult } from '@gitpilot/core';
import { exec } from 'child_process';

export class VSCodeBuildProvider implements IBuildProvider {
  async runBuild(config: BuildConfig): Promise<BuildResult> {
    const start = Date.now();

    return new Promise((resolve) => {
      const child = exec(config.command, {
        cwd: config.cwd ?? process.cwd(),
        timeout: config.timeout ?? 5 * 60 * 1000,
        env: { ...process.env, ...config.env },
        maxBuffer: 10 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        const ms = Date.now() - start;
        const output = stdout + (stderr ? '\n[STDERR]\n' + stderr : '');
        if (error) {
          resolve({ success: false, output: output.slice(-5000), error: stderr?.slice(-1000) || error.message, exitCode: error.code ?? 1, durationMs: ms });
        } else {
          resolve({ success: true, output: output.slice(-5000), exitCode: 0, durationMs: ms });
        }
      });
    });
  }
}
