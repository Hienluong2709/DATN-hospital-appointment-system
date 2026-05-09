import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { Room } from '../../rooms/models/rooms.model';
import { RoomsApiService } from '../../rooms/services/rooms.api';
import { Specialty } from '../../specialties/models/specialties.model';
import { SpecialtiesApiService } from '../../specialties/services/specialties.api';
import { Doctor, DoctorStatus, DoctorUpsertPayload } from '../models/doctors.model';
import { DoctorDetailModalComponent } from './doctor-detail/doctor-detail-modal.component';
import { DoctorFormModalComponent } from './doctor-form/doctor-form-modal.component';
import { DoctorsApiService } from '../services/doctors.api';
import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { getDoctorStatusLabel } from '../../../shared/enum-label.util';
import { UsersApiService } from '../../users/services/users.api';
import { User } from '../../users/models/users.model';

@Component({
  selector: 'app-doctors-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DoctorFormModalComponent, DoctorDetailModalComponent, SharedPaginationComponent],
  templateUrl: './doctors-page.component.html',
  styleUrl: './doctors-page.component.scss'
})
export class DoctorsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly doctorsApiService = inject(DoctorsApiService);
  private readonly specialtiesApiService = inject(SpecialtiesApiService);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly usersApiService = inject(UsersApiService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchTermChanges = new Subject<string>();
  private readonly subscriptions = new Subscription();

  doctors: Doctor[] = [];
  specialties: Specialty[] = [];
  rooms: Room[] = [];
  doctorUsers: User[] = [];
  selectedDoctor: Doctor | null = null;
  editingDoctorId: number | null = null;

  isFormModalOpen = false;
  isDetailModalOpen = false;

  isLoadingList = false;
  isLoadingDetail = false;
  isLoadingSpecialties = false;
  isLoadingRooms = false;
  isSubmitting = false;

  feedbackType: 'success' | 'error' = 'success';
  feedbackMessage = '';
  private bodyOverflowBeforeModal = '';

  searchTerm = '';
  selectedStatus: DoctorStatus | 'ALL' = 'ALL';
  selectedSpecialtyId = 0;
  selectedRoomId = 0;
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  readonly pageSizeOptions = [10, 20, 50];
  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  readonly statusOptions: DoctorStatus[] = ['Active', 'Inactive'];

  readonly form = this.fb.nonNullable.group({
    user_id: [0, [Validators.required, Validators.min(1)]],
    specialty_id: [0, [Validators.required, Validators.min(1)]],
    room_id: [0],
    status: ['Active' as DoctorStatus, [Validators.required]],
    description: ['']
  });

  get userControl() {
    return this.form.controls.user_id;
  }

  get specialtyControl() {
    return this.form.controls.specialty_id;
  }

  get roomControl() {
    return this.form.controls.room_id;
  }

  get canManageDoctors(): boolean {
    return this.currentRole === 'ADMIN';
  }

  get filteredRooms(): Room[] {
    const specialtyId = this.form.controls.specialty_id.value;
    if (!specialtyId) {
      return this.rooms;
    }

    return this.rooms.filter((room) => room.specialty_id === specialtyId);
  }

  get availableDoctorUsers(): User[] {
    const assignedUserIds = new Set(
      this.doctors
        .filter((doctor) => doctor.id !== this.editingDoctorId)
        .map((doctor) => doctor.user_id),
    );

    return this.doctorUsers.filter((user) => !assignedUserIds.has(user.id));
  }

  getDoctorStatusLabel(status: string | null | undefined): string {
    return getDoctorStatusLabel(status);
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.searchTerm = params.get('q') ?? '';
        this.selectedStatus = this.parseStatusParam(params.get('status'));
        this.selectedSpecialtyId = this.parsePositiveQueryParam(params.get('specialty_id'));
        this.selectedRoomId = this.parsePositiveQueryParam(params.get('room_id'));
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

    this.loadSpecialties();
    this.loadRooms();
    this.loadDoctorUsers();
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
    this.selectedStatus = 'ALL';
    this.selectedSpecialtyId = 0;
    this.selectedRoomId = 0;
    this.currentPage = 1;
    this.updateQueryParams(true);
  }

  openCreateModal(): void {
    if (!this.canManageDoctors) {
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
    this.selectedDoctor = null;
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingDoctorId = null;
    this.form.reset({
      user_id: 0,
      specialty_id: 0,
      room_id: 0,
      status: 'Active',
      description: ''
    });
  }

  startEdit(doctor: Doctor): void {
    if (!this.canManageDoctors) {
      return;
    }

    this.feedbackMessage = '';
    this.editingDoctorId = doctor.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
    this.form.reset({
      user_id: doctor.user_id,
      specialty_id: doctor.specialty_id,
      room_id: doctor.room_id ?? 0,
      status: doctor.status,
      description: doctor.description ?? ''
    });
  }

  onViewMore(id: number): void {
    this.feedbackMessage = '';
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;
    this.selectedDoctor = null;

    this.doctorsApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedDoctor = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết bác sĩ.');
        this.closeDetailModal();
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  onSpecialtyChanged(specialtyId: number): void {
    const roomId = this.form.controls.room_id.value;
    if (!specialtyId || !roomId) {
      return;
    }

    const selectedRoom = this.rooms.find((room) => room.id === roomId);
    if (selectedRoom && selectedRoom.specialty_id !== specialtyId) {
      this.form.controls.room_id.setValue(0);
    }
  }

  onSubmit(): void {
    if (!this.canManageDoctors) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    const raw = this.form.getRawValue();
    const roomId = Number(raw.room_id);
    const normalizedRoomId = roomId > 0 ? roomId : null;
    const room = normalizedRoomId ? this.rooms.find((item) => item.id === normalizedRoomId) : null;
    const payload: DoctorUpsertPayload = {
      user_id: Number(raw.user_id),
      specialty_id: Number(raw.specialty_id),
      room_id: normalizedRoomId,
      status: raw.status,
      description: raw.description.trim() || null
    };

    if (!Number.isInteger(payload.user_id) || payload.user_id <= 0) {
      this.userControl.setErrors({ required: true });
      this.userControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!Number.isInteger(payload.specialty_id) || payload.specialty_id <= 0) {
      this.specialtyControl.setErrors({ required: true });
      this.specialtyControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (room && room.specialty_id !== payload.specialty_id) {
      this.roomControl.setErrors({ invalidRoom: true });
      this.roomControl.markAsTouched();
      this.showFeedback('error', 'Phòng phải thuộc đúng chuyên khoa đã chọn.');
      this.isSubmitting = false;
      return;
    }

    if (this.editingDoctorId) {
      this.updateDoctor(this.editingDoctorId, payload);
      return;
    }

    this.createDoctor(payload);
  }

  onDelete(doctor: Doctor): void {
    if (!this.canManageDoctors) {
      return;
    }

    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa bác sĩ #${doctor.id}?`);
    if (!shouldDelete) {
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    this.doctorsApiService.delete(doctor.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa bác sĩ thành công.');

        if (this.selectedDoctor?.id === doctor.id) {
          this.closeDetailModal();
        }

        if (this.editingDoctorId === doctor.id) {
          this.startCreateMode();
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa bác sĩ.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  displayDoctorName(doctor: Doctor): string {
    return doctor.User?.fullname || doctor.User?.username || doctor.User?.email || `Doctor ${doctor.id}`;
  }

  get rowOffset(): number {
    return (this.currentPage - 1) * this.pageSize;
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

  private loadList(): void {
    this.isLoadingList = true;
    this.feedbackMessage = '';

    this.doctorsApiService.getAll({
      q: this.searchTerm,
      status: this.selectedStatus,
      specialty_id: this.selectedSpecialtyId || undefined,
      room_id: this.selectedRoomId || undefined,
      page: this.currentPage,
      page_size: this.pageSize
    }).subscribe({
      next: (response) => {
        this.doctors = response.data;
        this.totalItems = response.pagination?.total_items ?? response.data.length;
        this.currentPage = response.pagination?.page ?? this.currentPage;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách bác sĩ.');
      },
      complete: () => {
        this.isLoadingList = false;
      }
    });
  }

  private loadSpecialties(): void {
    this.isLoadingSpecialties = true;

    this.specialtiesApiService.getAll().subscribe({
      next: (response) => {
        this.specialties = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh mục chuyên khoa.');
      },
      complete: () => {
        this.isLoadingSpecialties = false;
      }
    });
  }

  private loadRooms(): void {
    this.isLoadingRooms = true;

    this.roomsApiService.getAll().subscribe({
      next: (response) => {
        this.rooms = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách phòng.');
      },
      complete: () => {
        this.isLoadingRooms = false;
      }
    });
  }

  private loadDoctorUsers(): void {
    this.usersApiService.getAll({
      role: 'DOCTOR',
      page: 1,
      page_size: 200,
    }).subscribe({
      next: (response) => {
        this.doctorUsers = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách tài khoản bác sĩ.');
      }
    });
  }

  private createDoctor(payload: DoctorUpsertPayload): void {
    this.doctorsApiService.create(payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Tạo bác sĩ thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tạo bác sĩ.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateDoctor(id: number, payload: DoctorUpsertPayload): void {
    this.doctorsApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Cập nhật bác sĩ thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedDoctor?.id === id) {
          this.selectedDoctor = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật bác sĩ.');
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

  private updateQueryParams(replaceUrl = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm.trim() || null,
        status: this.selectedStatus !== 'ALL' ? this.selectedStatus : null,
        specialty_id: this.selectedSpecialtyId > 0 ? this.selectedSpecialtyId : null,
        room_id: this.selectedRoomId > 0 ? this.selectedRoomId : null,
        page: this.currentPage > 1 ? this.currentPage : null,
        page_size: this.pageSize !== this.pageSizeOptions[0] ? this.pageSize : null
      },
      replaceUrl
    });
  }

  private parsePositiveQueryParam(value: string | null, fallback = 0): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseStatusParam(value: string | null): DoctorStatus | 'ALL' {
    return this.statusOptions.includes(value as DoctorStatus) ? (value as DoctorStatus) : 'ALL';
  }
}
