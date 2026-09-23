// ============================================================
// INotificationProvider — user notification abstraction
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
  /** Show a notification; returns the ID of the action the user clicked */
  show(payload: NotificationPayload): Promise<string | undefined>;
}
