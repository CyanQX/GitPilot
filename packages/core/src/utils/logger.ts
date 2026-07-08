// ============================================================
// Logger — 纯日志工具（零平台依赖）
// ============================================================

export enum LogLevel { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3 }

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

export type LogListener = (entry: LogEntry) => void;

export class Logger {
  private module: string;
  private static level: LogLevel = LogLevel.INFO;
  private static listeners: LogListener[] = [];
  private static history: LogEntry[] = [];
  private static maxHistory = 500;

  constructor(module: string) {
    this.module = module;
  }

  static setLevel(level: LogLevel): void { Logger.level = level; }
  static addListener(cb: LogListener): void { Logger.listeners.push(cb); }
  static removeListener(cb: LogListener): void {
    Logger.listeners = Logger.listeners.filter((l) => l !== cb);
  }
  static getHistory(): LogEntry[] { return [...Logger.history]; }
  static clearHistory(): void { Logger.history = []; }

  debug(msg: string, data?: any): void { this.log(LogLevel.DEBUG, msg, data); }
  info(msg: string, data?: any): void { this.log(LogLevel.INFO, msg, data); }
  warn(msg: string, data?: any): void { this.log(LogLevel.WARN, msg, data); }
  error(msg: string, data?: any): void { this.log(LogLevel.ERROR, msg, data); }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level < Logger.level) return;

    const entry: LogEntry = { timestamp: new Date(), level, module: this.module, message, data };
    Logger.history.push(entry);
    if (Logger.history.length > Logger.maxHistory) Logger.history.shift();

    for (const listener of Logger.listeners) {
      try { listener(entry); } catch { /* 不因监听器异常中断 */ }
    }
  }
}
