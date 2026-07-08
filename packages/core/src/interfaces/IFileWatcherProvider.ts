// ============================================================
// IFileWatcherProvider — 文件变更监听抽象
// ============================================================

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

export interface WatchConfig {
  paths: string | string[];
  ignored?: string[];
  debounceMs?: number;
}

export type FileChangeCallback = (events: FileChangeEvent[]) => void;

export interface IFileWatcherProvider {
  /** 启动监听 */
  start(config: WatchConfig, callback: FileChangeCallback): Promise<void>;

  /** 停止监听 */
  stop(): Promise<void>;

  /** 立即触发（跳过防抖） */
  flush(): void;
}
