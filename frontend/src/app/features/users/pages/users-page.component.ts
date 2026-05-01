import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { User, UserGender, UserRole, UserUpsertPayload } from '../models/users.model';
import { UserDetailModalComponent } from './user-detail/user-detail-modal.component';
import { UserFormModalComponent } from './user-form/user-form-modal.component';
import { UsersApiService } from '../services/users.api';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UserFormModalComponent, UserDetailModalComponent, SharedPaginationComponent],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss'
})
export class UsersPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly usersApiService = inject(UsersApiService);

  users: User[] = [];
  selectedUser: User | null = null;
  editingUserId: number | null = null;

  isFormModalOpen = false;
  isDetailModalOpen = false;

  isLoadingList = false;
  isLoadingDetail = false;
  isSubmitting = false;

  feedbackType: 'success' | 'error' = 'success';
  feedbackMessage = '';
  private bodyOverflowBeforeModal = '';

  currentPage = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  readonly roleOptions: UserRole[] = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'];
  readonly genderOptions: Array<{ value: UserGender; label: string }> = [
    { value: 'MALE', label: 'Nam' },
    { value: 'FEMALE', label: 'Nữ' },
    { value: 'OTHER', label: 'Khác' }
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
    role: ['PATIENT' as UserRole, [Validators.required]]
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
      return value.length < 6;
    }

    return value.length > 0 && value.length < 6;
  }

  get pagedUsers(): User[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.users.slice(startIndex, startIndex + this.pageSize);
  }

  get rowOffset(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  ngOnInit(): void {
    this.loadList();
  }

  ngOnDestroy(): void {
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

    if (this.isFormModalOpen) {
      this.closeFormModal();
    }
  }

  reload(): void {
    this.loadList();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.currentPage = 1;
    this.ensureValidPage();
  }

  openCreateModal(): void {
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
      role: 'PATIENT'
    });
  }

  startEdit(user: User): void {
    this.feedbackMessage = '';
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

  onViewMore(id: number): void {
    this.feedbackMessage = '';
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const password = raw.password.trim();

    if (!this.editingUserId && password.length < 6) {
      this.passwordControl.markAsTouched();
      return;
    }

    if (this.editingUserId && password.length > 0 && password.length < 6) {
      this.passwordControl.markAsTouched();
      return;
    }

    this.feedbackMessage = '';
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

  onDelete(user: User): void {
    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa người dùng ${user.username}?`);
    if (!shouldDelete) {
      return;
    }

    this.feedbackMessage = '';
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

  private loadList(): void {
    this.isLoadingList = true;
    this.feedbackMessage = '';

    this.usersApiService.getAll().subscribe({
      next: (response) => {
        this.users = response.data;
        this.ensureValidPage();
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
    this.feedbackType = type;
    this.feedbackMessage = message;
  }

  private updateBodyScrollState(): void {
    const hasOpenModal = this.isFormModalOpen || this.isDetailModalOpen;

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

  private ensureValidPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.users.length / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
  }
}
