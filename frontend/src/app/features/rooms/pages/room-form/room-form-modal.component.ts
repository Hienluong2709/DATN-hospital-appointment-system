import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { Specialty } from '../../../specialties/models/specialties.model';
import { getRoomStatusLabel } from '../../../../shared/enum-label.util';

@Component({
  selector: 'app-room-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './room-form-modal.component.html',
  styleUrl: './room-form-modal.component.css'
})
export class RoomFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) specialties: Specialty[] = [];
  @Input({ required: true }) nameInvalid = false;
  @Input({ required: true }) specialtyInvalid = false;

  @Output() submitForm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submitForm.emit();
  }

  getRoomStatusLabel(status: string | null | undefined): string {
    return getRoomStatusLabel(status);
  }
}
