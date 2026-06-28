import { Injectable, signal } from '@angular/core';

export type ConfirmationTone = 'primary' | 'danger';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmationTone;
}

export interface ConfirmationState extends Required<ConfirmationOptions> {
  isOpen: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmationService {
  readonly confirmation = signal<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    tone: 'primary',
  });

  private resolveCurrent: ((confirmed: boolean) => void) | null = null;

  confirm(options: ConfirmationOptions): Promise<boolean> {
    this.resolveCurrent?.(false);

    this.confirmation.set({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? 'Xác nhận',
      cancelText: options.cancelText ?? 'Hủy',
      tone: options.tone ?? 'primary',
    });

    return new Promise<boolean>((resolve) => {
      this.resolveCurrent = resolve;
    });
  }

  accept(): void {
    this.close(true);
  }

  cancel(): void {
    this.close(false);
  }

  private close(confirmed: boolean): void {
    this.confirmation.update((current) => ({
      ...current,
      isOpen: false,
    }));

    this.resolveCurrent?.(confirmed);
    this.resolveCurrent = null;
  }
}
