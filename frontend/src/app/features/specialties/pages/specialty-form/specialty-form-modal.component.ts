import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-specialty-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './specialty-form-modal.component.html',
  styleUrl: './specialty-form-modal.component.css'
})
export class SpecialtyFormModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isSubmitting = false;
  @Input({ required: true }) isEditMode = false;
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) nameInvalid = false;

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
}
