import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { DoctorStatus } from '../../models/doctors.model';
import { Specialty } from '../../../specialties/models/specialties.model';
import { Room } from '../../../rooms/models/rooms.model';
import { User } from '../../../users/models/users.model';
import { getDoctorStatusLabel } from '../../../../shared/enum-label.util';

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
  @Input({ required: true }) doctorUsers: User[] = [];
  @Input({ required: true }) nameInvalid = false;
  @Input({ required: true }) specialtyInvalid = false;
  @Input({ required: true }) roomInvalid = false;
  @Input({ required: true }) userInvalid = false;
  @Input({ required: true }) statusOptions: DoctorStatus[] = ['Active', 'Inactive'];

  @Output() submitForm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() specialtyChanged = new EventEmitter<number>();

  userSearchTerm = '';
  isUserDropdownOpen = false;
  private userControlSubscription: Subscription | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['form']) {
      this.bindUserControl();
    }

    if (changes['doctorUsers']) {
      this.syncUserSearchFromControl();
    }

    if (changes['isOpen'] && this.isOpen) {
      this.syncUserSearchFromControl();
    }
  }

  ngOnDestroy(): void {
    this.userControlSubscription?.unsubscribe();
  }

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

  onUserSearchFocus(): void {
    this.isUserDropdownOpen = true;
  }

  onUserSearchInput(value: string): void {
    this.userSearchTerm = value;
    this.isUserDropdownOpen = true;

    const selectedUser = this.getSelectedDoctorUser();
    const currentLabel = selectedUser ? this.getDoctorUserLabel(selectedUser) : '';

    if (this.normalizeText(value) !== this.normalizeText(currentLabel)) {
      this.form.controls['user_id']?.setValue(0, { emitEvent: false });
    }
  }

  onUserSearchBlur(): void {
    window.setTimeout(() => {
      this.isUserDropdownOpen = false;

      const selectedUser = this.getSelectedDoctorUser();
      if (selectedUser) {
        this.userSearchTerm = this.getDoctorUserLabel(selectedUser);
        return;
      }

      if (!this.filteredDoctorUsers.length) {
        this.userSearchTerm = '';
      }
    }, 120);
  }

  toggleUserDropdown(): void {
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
    if (this.isUserDropdownOpen) {
      this.syncUserSearchFromControl();
    }
  }

  selectDoctorUser(user: User): void {
    this.form.controls['user_id']?.setValue(user.id);
    this.userSearchTerm = this.getDoctorUserLabel(user);
    this.isUserDropdownOpen = false;
  }

  get filteredDoctorUsers(): User[] {
    const keyword = this.normalizeText(this.userSearchTerm);
    if (!keyword) {
      return this.doctorUsers;
    }

    return this.doctorUsers.filter((user) => {
      const searchFields = [
        user.fullname,
        user.username,
        user.email,
        user.phone,
      ];

      return searchFields.some((field) => this.normalizeText(field).includes(keyword));
    });
  }

  getDoctorStatusLabel(status: string | null | undefined): string {
    return getDoctorStatusLabel(status);
  }

  getDoctorUserLabel(user: User): string {
    const fullname = user.fullname?.trim();
    const username = user.username?.trim();

    if (fullname && username && fullname !== username) {
      return `${fullname} (${username})`;
    }

    return fullname || username || `Người dùng #${user.id}`;
  }

  private bindUserControl(): void {
    this.userControlSubscription?.unsubscribe();

    const control = this.form?.controls['user_id'];
    if (!control) {
      return;
    }

    this.userControlSubscription = control.valueChanges.subscribe(() => {
      this.syncUserSearchFromControl();
    });

    this.syncUserSearchFromControl();
  }

  private syncUserSearchFromControl(): void {
    const selectedUser = this.getSelectedDoctorUser();
    this.userSearchTerm = selectedUser ? this.getDoctorUserLabel(selectedUser) : '';
  }

  private getSelectedDoctorUser(): User | undefined {
    const selectedUserId = Number(this.form?.controls['user_id']?.value);
    if (!Number.isInteger(selectedUserId) || selectedUserId <= 0) {
      return undefined;
    }

    return this.doctorUsers.find((user) => user.id === selectedUserId);
  }

  private normalizeText(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}
