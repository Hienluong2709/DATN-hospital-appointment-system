import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { WorkSchedule } from '../../models/work-schedules.model';

@Component({
  selector: 'app-work-schedule-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-schedule-detail-modal.component.html',
  styleUrl: './work-schedule-detail-modal.component.scss'
})
export class WorkScheduleDetailModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isLoading = false;
  @Input() schedule: WorkSchedule | null = null;
  @Input() doctorName = '--';
  @Input() dayLabel = '--';
  @Input() startTimeLabel = '--';
  @Input() endTimeLabel = '--';

  @Output() closeModal = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }
}