import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

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

@Component({
  selector: 'app-doctors-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DoctorFormModalComponent, DoctorDetailModalComponent, SharedPaginationComponent],
  templateUrl: './doctors-page.component.html',
  styleUrl: './doctors-page.component.scss'
})
export class DoctorsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly doctorsApiService = inject(DoctorsApiService);
  private readonly specialtiesApiService = inject(SpecialtiesApiService);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly tokenService = inject(TokenService);

  doctors: Doctor[] = [];
  specialties: Specialty[] = [];
  rooms: Room[] = [];
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

  currentPage = 1;
  pageSize = 10;
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

  ngOnInit(): void {
    this.loadList();
    this.loadSpecialties();
    this.loadRooms();
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

  get pagedDoctors(): Doctor[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.doctors.slice(startIndex, startIndex + this.pageSize);
  }

  get rowOffset(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  onPageChange(page: number): void {
    this.currentPage = page;
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.currentPage = 1;
  }

  private loadList(): void {
    this.isLoadingList = true;
    this.feedbackMessage = '';

    this.doctorsApiService.getAll().subscribe({
      next: (response) => {
        this.doctors = response.data;
        this.ensureValidPage();
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

  private ensureValidPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.doctors.length / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
  }
}
