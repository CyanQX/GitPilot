// ============================================================
// INotificationProvider — 用户通知抽象
// VS Code → window.showInformationMessage
// JetBrains → Notification API
// ============================================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  id: string;
  danger?: boolean;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  actions?: NotificationAction[];
}

export interface INotificationProvider {
  /** 显示通知，返回用户点击的操作 ID */
  show(payload: NotificationPayload): Promise<string | undefined>;
}
