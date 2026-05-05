import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { NotificationModalComponent } from '../../../shared/components/notification-modal/notification-modal.component';
import { User, UserGender } from '../../users/models/users.model';
import { UsersApiService } from '../../users/services/users.api';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NotificationModalComponent],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit {
  private readonly tokenService = inject(TokenService);
  private readonly usersApiService = inject(UsersApiService);

  profile: User | null = null;
  isLoading = false;
  isSaving = false;
  isEditing = false;
  inlineErrorMessage = '';

  notificationMessage = '';
  notificationType: 'success' | 'error' = 'success';
  notificationVersion = 0;
  isNotificationOpen = false;

  form = {
    fullname: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '' as '' | UserGender,
    address: ''
  };

  readonly genderOptions: Array<{ value: UserGender; label: string }> = [
    { value: 'MALE', label: 'Nam' },
    { value: 'FEMALE', label: 'Nữ' },
    { value: 'OTHER', label: 'Khác' }
  ];

  ngOnInit(): void {
    this.loadProfile();
  }

  get displayRole(): string {
    return this.roleLabel(this.profile?.role ?? this.tokenService.getCurrentRole());
  }

  get isSelfEditable(): boolean {
    const role = this.profile?.role ?? this.tokenService.getCurrentRole();
    return role === 'ADMIN' || role === 'PATIENT' || role === 'DOCTOR' || role === 'RECEPTIONIST';
  }

  get displayUsername(): string {
    const fallbackUsername = this.asText(this.tokenService.getCurrentUser()?.['username']);
    return this.profile?.username || fallbackUsername || '--';
  }

  get displayStatus(): string {
    return 'Đang hoạt động';
  }

  get displayEmail(): string {
    return this.profile?.email || 'Chưa cập nhật';
  }

  get displayPhone(): string {
    return this.profile?.phone || 'Chưa cập nhật';
  }

  get identityCodeLabel(): string {
    return this.profile?.role === 'PATIENT' ? 'Mã bệnh nhân' : 'Mã tài khoản';
  }

  get identityCodeValue(): string {
    return this.displayUsername;
  }

  get displayDateOfBirth(): string {
    return this.profile?.date_of_birth || 'Chưa cập nhật';
  }

  get displayGender(): string {
    return this.genderLabel(this.profile?.gender);
  }

  get displayAddress(): string {
    return this.profile?.address || 'Chưa cập nhật';
  }

  startEdit(): void {
    if (!this.profile || !this.isSelfEditable || this.isSaving) {
      return;
    }

    this.inlineErrorMessage = '';
    this.isEditing = true;
    this.patchForm(this.profile);
  }

  cancelEdit(): void {
    this.inlineErrorMessage = '';
    this.isEditing = false;
    if (this.profile) {
      this.patchForm(this.profile);
    }
  }

  saveProfile(): void {
    if (!this.profile || !this.isSelfEditable || this.isSaving) {
      return;
    }

    const fullname = this.form.fullname.trim();
    if (!fullname) {
      this.inlineErrorMessage = 'Vui lòng nhập họ tên.';
      return;
    }

    this.inlineErrorMessage = '';
    this.isSaving = true;

    this.usersApiService
      .updateMe({
        fullname,
        email: this.form.email.trim() || null,
        phone: this.form.phone.trim() || null,
        date_of_birth: this.form.date_of_birth || null,
        gender: this.form.gender || null,
        address: this.form.address.trim() || null
      })
      .subscribe({
        next: (response) => {
          this.profile = response.data;
          this.patchForm(response.data);
          this.syncCurrentUser(response.data);
          this.isEditing = false;
          this.showNotification('success', 'Cập nhật hồ sơ thành công.');
        },
        error: (error: { error?: { message?: string } }) => {
          this.inlineErrorMessage = error.error?.message ?? 'Không thể cập nhật hồ sơ.';
        },
        complete: () => {
          this.isSaving = false;
        }
      });
  }

  closeNotification(): void {
    this.isNotificationOpen = false;
    this.notificationMessage = '';
  }

  private loadProfile(): void {
    this.isLoading = true;
    this.inlineErrorMessage = '';

    this.usersApiService.getMe().subscribe({
      next: (response) => {
        this.profile = response.data;
        this.patchForm(response.data);
        this.syncCurrentUser(response.data);
      },
      error: (error: { error?: { message?: string } }) => {
        this.inlineErrorMessage = error.error?.message ?? 'Không thể tải thông tin hồ sơ.';
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private patchForm(user: User): void {
    this.form = {
      fullname: user.fullname ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      date_of_birth: user.date_of_birth ?? '',
      gender: user.gender ?? '',
      address: user.address ?? ''
    };
  }

  private syncCurrentUser(user: User): void {
    const currentUser = this.tokenService.getCurrentUser() ?? {};
    this.tokenService.setCurrentUser({
      ...currentUser,
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      address: user.address,
      role: user.role
    });
  }

  private showNotification(type: 'success' | 'error', message: string): void {
    this.notificationType = type;
    this.notificationMessage = message;
    this.notificationVersion += 1;
    this.isNotificationOpen = true;
  }

  private asText(value: unknown): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
  }

  private roleLabel(role: BackendRole | User['role'] | null | undefined): string {
    if (role === 'ADMIN') {
      return 'Quản trị viên';
    }

    if (role === 'RECEPTIONIST') {
      return 'Lễ tân';
    }

    if (role === 'DOCTOR') {
      return 'Bác sĩ';
    }

    if (role === 'PATIENT') {
      return 'Bệnh nhân';
    }

    return 'Chưa xác định';
  }

  private genderLabel(gender: User['gender'] | null | undefined): string {
    if (gender === 'MALE') {
      return 'Nam';
    }

    if (gender === 'FEMALE') {
      return 'Nữ';
    }

    if (gender === 'OTHER') {
      return 'Khác';
    }

    return 'Chưa cập nhật';
  }
}
