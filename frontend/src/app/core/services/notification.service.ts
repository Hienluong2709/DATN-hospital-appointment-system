import { Injectable, signal } from '@angular/core';

export type AppNotificationType = 'success' | 'error';

export interface AppNotificationState {
  isOpen: boolean;
  message: string;
  type: AppNotificationType;
  title: string;
  autoCloseMs: number;
  version: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  readonly notification = signal<AppNotificationState>({
    isOpen: false,
    message: '',
    type: 'success',
    title: 'Thành công',
    autoCloseMs: 5000,
    version: 0,
  });

  success(message: string, title = 'Thành công', autoCloseMs = 5000): void {
    this.show('success', message, title, autoCloseMs);
  }

  error(message: string, title = 'Thất bại', autoCloseMs = 5000): void {
    this.show('error', message, title, autoCloseMs);
  }

  close(): void {
    this.notification.update((current) => ({
      ...current,
      isOpen: false,
      message: '',
    }));
  }

  private show(
    type: AppNotificationType,
    message: string,
    title: string,
    autoCloseMs: number,
  ): void {
    this.notification.update((current) => ({
      isOpen: true,
      message,
      type,
      title,
      autoCloseMs,
      version: current.version + 1,
    }));
  }
}
