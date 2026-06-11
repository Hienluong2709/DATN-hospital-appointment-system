import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ConfirmationTone } from '../../../core/services/confirmation.service';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrl: './confirmation-modal.component.scss',
})
export class ConfirmationModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = 'Xác nhận';
  @Input() cancelText = 'Hủy';
  @Input() tone: ConfirmationTone = 'primary';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
