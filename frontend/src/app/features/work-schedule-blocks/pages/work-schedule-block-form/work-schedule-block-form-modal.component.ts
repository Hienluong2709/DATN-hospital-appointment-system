import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { Doctor } from '../../../doctors/models/doctors.model';

@Component({
  selector: 'app-work-schedule-block-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './work-schedule-block-form-modal.component.html',
  styleUrl: './work-schedule-block-form-modal.component.css'
})
export class WorkScheduleBlockFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) doctors: Doctor[] = [];
  @Input({ required: true }) doctorInvalid = false;
  @Input({ required: true }) dateInvalid = false;
  @Input({ required: true }) timeInvalid = false;

  @Output() submitForm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() offStateChanged = new EventEmitter<boolean>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submitForm.emit();
  }

  onOffToggle(value: boolean): void {
    this.offStateChanged.emit(value);
  }
}