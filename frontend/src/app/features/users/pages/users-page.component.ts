import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ConfirmationService } from '../../../core/services/confirmation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { User, UserGender, UserRole, UserStatus, UserUpsertPayload } from '../models/users.model';
import { UserDetailModalComponent } from './user-detail/user-detail-modal.component';
import { UserFormModalComponent } from './user-form/user-form-modal.component';
import { UsersApiService } from '../services/users.api';
import { getRoleLabel, getUserStatusLabel } from '../../../shared/enum-label.util';

type UserManagementMode = 'staff' | 'patients';
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, UserFormModalComponent, UserDetailModalComponent, SharedPaginationComponent],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss'
})
export class UsersPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly usersApiService = inject(UsersApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchTermChanges = new Subject<string>();
  private readonly subscriptions = new Subscription();

  users: User[] = [];
  selectedUser: User | null = null;
  editingUserId: number | null = null;
  passwordResetUser: User | null = null;
  managementMode: UserManagementMode = 'staff';

  isFormModalOpen = false;
  isDetailModalOpen = false;
  isResetPasswordModalOpen = false;

  isLoadingList = false;
  isLoadingDetail = false;
  isSubmitting = false;

  private bodyOverflowBeforeModal = '';

  searchTerm = '';
  selectedRole: UserRole | 'ALL' = 'ALL';
  selectedGender: UserGender | 'ALL' = 'ALL';
  selectedStatus: UserStatus | 'ALL' = 'ALL';
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  readonly pageSizeOptions = [10, 20, 50];
  readonly roleOptions: UserRole[] = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'];
  readonly staffRoleOptions: UserRole[] = ['RECEPTIONIST', 'DOCTOR'];
  readonly genderOptions: Array<{ value: UserGender; label: string }> = [
    { value: 'MALE', label: 'Nam' },
    { value: 'FEMALE', label: 'Nữ' },
    { value: 'OTHER', label: 'Khác' }
  ];
  readonly statusOptions: Array<{ value: UserStatus; label: string }> = [
    { value: 'Active', label: 'Đang hoạt động' },
    { value: 'Inactive', label: 'Đã khóa' }
  ];

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: [''],
    fullname: ['', [Validators.required]],
    email: [''],
    phone: [''],
    date_of_birth: [''],
    gender: ['' as '' | UserGender],
    address: [''],
    role: ['RECEPTIONIST' as UserRole, [Validators.required]]
  });

  readonly resetPasswordForm = this.fb.nonNullable.group({
    confirm: [true]
  });

  get usernameControl() {
    return this.form.controls.username;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get fullnameControl() {
    return this.form.controls.fullname;
  }

  get roleControl() {
    return this.form.controls.role;
  }

  get passwordInvalid(): boolean {
    const value = this.passwordControl.value.trim();
    const touched = this.passwordControl.touched || this.passwordControl.dirty;

    if (!touched) {
      return false;
    }

    if (!this.editingUserId) {
      return !STRONG_PASSWORD_PATTERN.test(value);
    }

    return value.length > 0 && !STRONG_PASSWORD_PATTERN.test(value);
  }

  get resetPasswordInvalid(): boolean {
    return false;
  }

  get resetPasswordConfirmInvalid(): boolean {
    return false;
  }

  get resetPasswordMismatch(): boolean {
    return false;
  }

  get rowOffset(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get isStaffManagement(): boolean {
    return this.managementMode === 'staff';
  }

  get pageTitle(): string {
    return this.isStaffManagement ? 'Quản lý nhân sự' : 'Quản lý bệnh nhân';
  }

  get pageSubtitle(): string {
    return this.isStaffManagement
      ? 'Tạo tài khoản bác sĩ, lễ tân, khóa đăng nhập và reset mật khẩu cho nhân sự.'
      : 'Tra cứu tài khoản bệnh nhân và khóa hoặc mở khóa đăng nhập khi cần.';
  }

  get tableTitle(): string {
    return this.isStaffManagement ? 'Danh sách nhân sự' : 'Danh sách bệnh nhân';
  }

  get emptyListMessage(): string {
    return this.isStaffManagement
      ? 'Không có nhân sự phù hợp với bộ lọc hiện tại.'
      : 'Không có bệnh nhân phù hợp với bộ lọc hiện tại.';
  }

  get availableRoleOptions(): UserRole[] {
    return this.isStaffManagement ? this.staffRoleOptions : ['PATIENT'];
  }

  getRoleLabel(role: string | null | undefined): string {
    return getRoleLabel(role);
  }

  getUserStatusLabel(status: string | null | undefined): string {
    return getUserStatusLabel(status);
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.data.subscribe((data) => {
        this.managementMode = data['mode'] === 'patients' ? 'patients' : 'staff';
        this.selectedRole = 'ALL';
        this.currentPage = 1;
        this.loadList();
      })
    );

    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.searchTerm = params.get('q') ?? '';
        this.selectedRole = this.isStaffManagement ? this.parseRoleParam(params.get('role')) : 'ALL';
        this.selectedGender = this.parseGenderParam(params.get('gender'));
        this.selectedStatus = this.parseStatusParam(params.get('status'));
        this.currentPage = this.parsePositiveQueryParam(params.get('page'), 1);
        this.pageSize = this.parsePositiveQueryParam(params.get('page_size'), this.pageSizeOptions[0]);
        this.loadList();
      })
    );

    this.subscriptions.add(
      this.searchTermChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
        this.currentPage = 1;
        this.updateQueryParams(true);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.unlockBodyScroll();
  }

  @HostListener('window:keydown.escape')
  onEscapePressed(): void {
    if (this.isSubmitting) {
      return;
    }

    if (this.isDetailModalOpen) {
      this.closeDetailModal();
      return;
    }

    if (this.isResetPasswordModalOpen) {
      this.closeResetPasswordModal();
      return;
    }

    if (this.isFormModalOpen) {
      this.closeFormModal();
    }
  }

  reload(): void {
    this.loadList();
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    this.searchTermChanges.next(value);
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.updateQueryParams(true);
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedRole = 'ALL';
    this.selectedGender = 'ALL';
    this.selectedStatus = 'ALL';
    this.currentPage = 1;
    this.updateQueryParams(true);
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.updateQueryParams(true);
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.currentPage = 1;
    this.updateQueryParams(true);
  }

  openCreateModal(): void {
    if (!this.isStaffManagement) {
      return;
    }

    this.startCreateMode();
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
  }

  closeFormModal(): void {
    if (this.isSubmitting) {
      return;
    }

    this.isFormModalOpen = false;
    this.startCreateMode();
    this.updateBodyScrollState();
  }

  closeDetailModal(): void {
    this.isDetailModalOpen = false;
    this.selectedUser = null;
    this.updateBodyScrollState();
  }

  closeResetPasswordModal(): void {
    if (this.isSubmitting) {
      return;
    }

    this.isResetPasswordModalOpen = false;
    this.passwordResetUser = null;
    this.resetPasswordForm.reset({
      confirm: true
    });
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingUserId = null;
    this.form.reset({
      username: '',
      password: '',
      fullname: '',
      email: '',
      phone: '',
      date_of_birth: '',
      gender: '',
      address: '',
      role: 'RECEPTIONIST'
    });
  }

  startEdit(user: User): void {
    if (!this.canManageStaffAccount(user)) {
      this.showFeedback('error', 'Chỉ chỉnh sửa tài khoản bác sĩ hoặc lễ tân tại màn hình này.');
      return;
    }

    this.editingUserId = user.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
    this.form.reset({
      username: user.username,
      password: '',
      fullname: user.fullname,
      email: user.email ?? '',
      phone: user.phone ?? '',
      date_of_birth: user.date_of_birth ?? '',
      gender: user.gender ?? '',
      address: user.address ?? '',
      role: user.role
    });
  }

  openResetPasswordModal(user: User): void {
    if (!this.canManageStaffAccount(user)) {
      this.showFeedback('error', 'Chỉ reset mật khẩu cho tài khoản bác sĩ hoặc lễ tân.');
      return;
    }

    this.passwordResetUser = user;
    this.resetPasswordForm.reset({
      confirm: true
    });
    this.isResetPasswordModalOpen = true;
    this.updateBodyScrollState();
  }

  onViewMore(id: number): void {
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;

    this.usersApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedUser = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết người dùng.');
        this.closeDetailModal();
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  onSubmit(): void {
    if (!this.isStaffManagement) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const password = raw.password.trim();

    if (!this.editingUserId && !STRONG_PASSWORD_PATTERN.test(password)) {
      this.passwordControl.markAsTouched();
      return;
    }

    if (this.editingUserId && password.length > 0 && !STRONG_PASSWORD_PATTERN.test(password)) {
      this.passwordControl.markAsTouched();
      return;
    }

    this.isSubmitting = true;

    const payload: UserUpsertPayload = {
      username: raw.username.trim(),
      fullname: raw.fullname.trim(),
      email: raw.email.trim() || null,
      phone: raw.phone.trim() || null,
      date_of_birth: raw.date_of_birth || null,
      gender: raw.gender || null,
      address: raw.address.trim() || null,
      role: raw.role
    };

    if (password) {
      payload.password = password;
    }

    if (!payload.username) {
      this.usernameControl.setErrors({ required: true });
      this.usernameControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!payload.fullname) {
      this.fullnameControl.setErrors({ required: true });
      this.fullnameControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (this.editingUserId) {
      this.updateUser(this.editingUserId, payload);
      return;
    }

    this.createUser(payload);
  }

  onResetPasswordSubmit(): void {
    if (!this.passwordResetUser) {
      return;
    }

    if (!this.passwordResetUser.email) {
      this.showFeedback('error', 'Tài khoản chưa có email để nhận mật khẩu tạm thời.');
      return;
    }

    this.isSubmitting = true;

    this.usersApiService.resetPassword(this.passwordResetUser.id, { send_temporary_password: true }).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Đã gửi mật khẩu tạm thời qua email.');
        this.isSubmitting = false;
        this.closeResetPasswordModal();
      },
      error: (error: HttpErrorResponse) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể gửi mật khẩu tạm thời.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  onDelete(user: User): void {
    if (!this.isStaffManagement) {
      return;
    }

    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa người dùng ${user.username}?`);
    if (!shouldDelete) {
      return;
    }

    this.isSubmitting = true;

    this.usersApiService.delete(user.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa người dùng thành công.');

        if (this.selectedUser?.id === user.id) {
          this.closeDetailModal();
        }

        if (this.editingUserId === user.id) {
          this.startCreateMode();
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa người dùng.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  async onToggleStatus(user: User): Promise<void> {
    const nextStatus: UserStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    const actionLabel = nextStatus === 'Inactive' ? 'khóa' : 'mở khóa';
    const confirmed = await this.confirmationService.confirm({
      title: nextStatus === 'Inactive' ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản',
      message:
        nextStatus === 'Inactive'
          ? `Bạn có chắc chắn muốn khóa tài khoản ${user.username}? Người dùng này sẽ không thể đăng nhập cho đến khi được mở khóa.`
          : `Bạn có chắc chắn muốn mở khóa tài khoản ${user.username}? Người dùng này sẽ có thể đăng nhập lại hệ thống.`,
      confirmText: nextStatus === 'Inactive' ? 'Xác nhận khóa' : 'Xác nhận mở khóa',
      cancelText: 'Hủy',
      tone: nextStatus === 'Inactive' ? 'danger' : 'primary',
    });

    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;

    this.usersApiService.updateStatus(user.id, nextStatus).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? `${actionLabel} tài khoản thành công.`);

        this.users = this.users.map((currentUser) =>
          currentUser.id === user.id ? response.data : currentUser,
        );

        if (this.selectedUser?.id === user.id) {
          this.selectedUser = response.data;
        }
      },
      error: (error: HttpErrorResponse) => {
        this.showFeedback('error', error.error?.message ?? `Không thể ${actionLabel} tài khoản.`);
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  canManageStaffAccount(user: User): boolean {
    return this.isStaffManagement && this.staffRoleOptions.includes(user.role);
  }

  canToggleStatus(user: User): boolean {
    return this.isStaffManagement ? this.canManageStaffAccount(user) : user.role === 'PATIENT';
  }

  private loadList(): void {
    this.isLoadingList = true;
    this.usersApiService.getAll({
      q: this.searchTerm,
      scope: this.managementMode,
      role: this.selectedRole,
      gender: this.selectedGender,
      status: this.selectedStatus,
      page: this.currentPage,
      page_size: this.pageSize
    }).subscribe({
      next: (response) => {
        this.users = response.data;
        this.totalItems = response.pagination?.total_items ?? response.data.length;
        this.currentPage = response.pagination?.page ?? this.currentPage;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách người dùng.');
      },
      complete: () => {
        this.isLoadingList = false;
      }
    });
  }

  private createUser(payload: UserUpsertPayload): void {
    this.usersApiService.create(payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Tạo người dùng thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tạo người dùng.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateUser(id: number, payload: UserUpsertPayload): void {
    this.usersApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Cập nhật người dùng thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedUser?.id === id) {
          this.selectedUser = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật người dùng.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private showFeedback(type: 'success' | 'error', message: string): void {
    if (type === 'success') {
      this.notificationService.success(message);
      return;
    }

    this.notificationService.error(message);
  }

  private updateBodyScrollState(): void {
    const hasOpenModal = this.isFormModalOpen || this.isDetailModalOpen || this.isResetPasswordModalOpen;

    if (hasOpenModal) {
      this.lockBodyScroll();
      return;
    }

    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    if (!this.bodyOverflowBeforeModal) {
      this.bodyOverflowBeforeModal = document.body.style.overflow;
    }

    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.overflow = this.bodyOverflowBeforeModal;
    this.bodyOverflowBeforeModal = '';
  }

  private updateQueryParams(replaceUrl = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm.trim() || null,
        role: this.selectedRole !== 'ALL' ? this.selectedRole : null,
        gender: this.selectedGender !== 'ALL' ? this.selectedGender : null,
        status: this.selectedStatus !== 'ALL' ? this.selectedStatus : null,
        page: this.currentPage > 1 ? this.currentPage : null,
        page_size: this.pageSize !== this.pageSizeOptions[0] ? this.pageSize : null
      },
      replaceUrl
    });
  }

  private parsePositiveQueryParam(value: string | null, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseRoleParam(value: string | null): UserRole | 'ALL' {
    return this.availableRoleOptions.includes(value as UserRole) ? (value as UserRole) : 'ALL';
  }

  private parseGenderParam(value: string | null): UserGender | 'ALL' {
    return this.genderOptions.some((gender) => gender.value === value) ? (value as UserGender) : 'ALL';
  }

  private parseStatusParam(value: string | null): UserStatus | 'ALL' {
    return this.statusOptions.some((status) => status.value === value) ? (value as UserStatus) : 'ALL';
  }
}
