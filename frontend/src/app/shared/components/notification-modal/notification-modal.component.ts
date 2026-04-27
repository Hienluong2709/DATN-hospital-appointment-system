import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-notification-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-modal.component.html',
  styleUrl: './notification-modal.component.scss'
})
export class NotificationModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() message = '';
  @Input() type: 'success' | 'error' = 'success';
  @Input() autoCloseMs = 5000;
  @Input() version = 0;

  @Output() closed = new EventEmitter<void>();

  private autoCloseTimerId: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] || changes['message'] || changes['version']) {
      this.restartAutoCloseTimer();
    }
  }

  ngOnDestroy(): void {
    this.clearAutoCloseTimer();
  }

  close(): void {
    this.clearAutoCloseTimer();
    this.closed.emit();
  }

  private restartAutoCloseTimer(): void {
    this.clearAutoCloseTimer();

    if (!this.isOpen || !this.message) {
      return;
    }

    this.autoCloseTimerId = setTimeout(() => {
      this.closed.emit();
    }, this.autoCloseMs);
  }

  private clearAutoCloseTimer(): void {
    if (this.autoCloseTimerId) {
      clearTimeout(this.autoCloseTimerId);
      this.autoCloseTimerId = null;
    }
  }
}
