// ============================================================
// IFileWatcherProvider — file change watching abstraction
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
  /** Start watching */
  start(config: WatchConfig, callback: FileChangeCallback): Promise<void>;

  /** Stop watching */
  stop(): Promise<void>;

  /** Fire immediately (skip the debounce) */
  flush(): void;
}
