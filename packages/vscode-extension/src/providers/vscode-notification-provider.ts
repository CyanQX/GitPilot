// ============================================================
// VSCodeNotificationProvider — 实现 INotificationProvider
// ============================================================

import type { INotificationProvider, NotificationPayload, NotificationAction } from '@gitpilot/core';
import * as vscode from 'vscode';

export class VSCodeNotificationProvider implements INotificationProvider {
  async show(payload: NotificationPayload): Promise<string | undefined> {
    const labels = payload.actions?.map((a) => a.label) ?? [];

    let chosen: string | undefined;
    const text = `${payload.title}\n${payload.message}`;

    switch (payload.type) {
      case 'info': case 'success':
        chosen = await vscode.window.showInformationMessage(text, ...labels); break;
      case 'warning':
        chosen = await vscode.window.showWarningMessage(text, ...labels); break;
      case 'error':
        chosen = await vscode.window.showErrorMessage(text, ...labels); break;
    }

    if (chosen && payload.actions) {
      const action = payload.actions.find((a) => a.label === chosen);
      return action?.id;
    }
    return chosen;
  }
}
