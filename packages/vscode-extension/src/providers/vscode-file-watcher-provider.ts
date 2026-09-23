// ============================================================
// VSCodeFileWatcherProvider — implements IFileWatcherProvider
// Based on chokidar
// ============================================================

import type { IFileWatcherProvider, FileChangeEvent, WatchConfig, FileChangeCallback } from '@gitpilot/core';
import chokidar, { FSWatcher } from 'chokidar';

export class VSCodeFileWatcherProvider implements IFileWatcherProvider {
  private watcher: FSWatcher | null = null;
  private pending: FileChangeEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callback: FileChangeCallback | null = null;
  private debounceMs: number = 2000;

  async start(config: WatchConfig, callback: FileChangeCallback): Promise<void> {
    this.callback = callback;
    this.debounceMs = config.debounceMs ?? 2000;

    const ignored = [
      '**/node_modules/**', '**/.git/**', '**/dist/**',
      '**/build/**', '**/out/**', '**/.vscode/**', '**/.idea/**',
      ...(config.ignored ?? []),
    ];

    this.watcher = chokidar.watch(config.paths, {
      ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on('all', (event, p) => {
      if (event === 'add' || event === 'change' || event === 'unlink') {
        this.pending.push({ type: event, path: p, timestamp: new Date() });
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.debounceMs);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.pending = [];
  }

  flush(): void {
    if (this.pending.length > 0 && this.callback) {
      const events = [...this.pending];
      this.pending = [];
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.callback(events);
    }
  }
}
