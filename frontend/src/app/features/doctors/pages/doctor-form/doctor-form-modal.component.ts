import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DoctorStatus } from '../../models/doctors.model';
import { Specialty } from '../../../specialties/models/specialties.model';
import { Room } from '../../../rooms/models/rooms.model';

@Component({
  selector: 'app-doctor-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './doctor-form-modal.component.html',
  styleUrl: './doctor-form-modal.component.css'
})
export class DoctorFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) specialties: Specialty[] = [];
  @Input({ required: true }) rooms: Room[] = [];
  @Input({ required: true }) filteredRooms: Room[] = [];
  @Input({ required: true }) nameInvalid = false;
  @Input({ required: true }) specialtyInvalid = false;
  @Input({ required: true }) roomInvalid = false;
  @Input({ required: true }) userInvalid = false;
  @Input({ required: true }) statusOptions: DoctorStatus[] = ['Active', 'Inactive'];

  @Output() submitForm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() specialtyChanged = new EventEmitter<number>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submitForm.emit();
  }

  onSpecialtyChange(value: string | number): void {
    const parsed = Number(value);
    this.specialtyChanged.emit(Number.isFinite(parsed) ? parsed : 0);
  }
}
