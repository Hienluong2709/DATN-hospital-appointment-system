import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { WorkScheduleBlock } from '../../models/work-schedule-blocks.model';

@Component({
  selector: 'app-work-schedule-block-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-schedule-block-detail-modal.component.html',
  styleUrl: './work-schedule-block-detail-modal.component.scss'
})
export class WorkScheduleBlockDetailModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isLoading = false;
  @Input() block: WorkScheduleBlock | null = null;
  @Input() doctorName = '--';
  @Input() dateLabel = '--';
  @Input() startTimeLabel = '--';
  @Input() endTimeLabel = '--';
  @Input() statusLabel = '--';

  @Output() closeModal = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }
}
