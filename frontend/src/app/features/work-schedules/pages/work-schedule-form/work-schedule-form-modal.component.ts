import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { Doctor } from '../../../doctors/models/doctors.model';
import { WorkScheduleDayOfWeek } from '../../models/work-schedules.model';

@Component({
  selector: 'app-work-schedule-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './work-schedule-form-modal.component.html',
  styleUrl: './work-schedule-form-modal.component.css'
})
export class WorkScheduleFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) doctors: Doctor[] = [];
  @Input({ required: true }) nameInvalid = false;
  @Input({ required: true }) doctorInvalid = false;
  @Input({ required: true }) dayInvalid = false;
  @Input({ required: true }) timeInvalid = false;
  @Input({ required: true }) availableStartTimes: string[] = [];
  @Input({ required: true }) availableEndTimes: string[] = [];
  @Input({ required: true }) timeAvailabilityMessage = '';
  @Input({ required: true }) hasAvailableTimeOptions = false;

  @Output() submitForm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();

  readonly dayOptions: Array<{ value: WorkScheduleDayOfWeek; label: string }> = [
    { value: 0, label: 'Chu nhật' },
    { value: 1, label: 'Thứ hai' },
    { value: 2, label: 'Thứ ba' },
    { value: 3, label: 'Thứ tư' },
    { value: 4, label: 'Thứ năm' },
    { value: 5, label: 'Thứ sáu' },
    { value: 6, label: 'Thứ bảy' }
  ];

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submitForm.emit();
  }
}
