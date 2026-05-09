import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { UserGender, UserRole } from '../../models/users.model';
import { getRoleLabel } from '../../../../shared/enum-label.util';

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-form-modal.component.html',
  styleUrl: './user-form-modal.component.css'
})
export class UserFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) usernameInvalid = false;
  @Input({ required: true }) fullnameInvalid = false;
  @Input({ required: true }) roleInvalid = false;
  @Input({ required: true }) passwordInvalid = false;
  @Input({ required: true }) roleOptions: UserRole[] = [];
  @Input({ required: true }) genderOptions: Array<{ value: UserGender; label: string }> = [];

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

  getRoleLabel(role: string | null | undefined): string {
    return getRoleLabel(role);
  }
}
