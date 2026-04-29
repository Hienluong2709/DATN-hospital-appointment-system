import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { Specialty } from '../../specialties/models/specialties.model';
import { SpecialtiesApiService } from '../../specialties/services/specialties.api';
import { Room, RoomStatus, RoomUpsertPayload } from '../models/rooms.model';
import { RoomDetailModalComponent } from './room-detail/room-detail-modal.component';
import { RoomFormModalComponent } from './room-form/room-form-modal.component';
import { RoomsApiService } from '../services/rooms.api';
import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RoomFormModalComponent, RoomDetailModalComponent, SharedPaginationComponent],
  templateUrl: './rooms-page.component.html',
  styleUrl: './rooms-page.component.scss'
})
export class RoomsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly specialtiesApiService = inject(SpecialtiesApiService);
  private readonly tokenService = inject(TokenService);

  rooms: Room[] = [];
  specialties: Specialty[] = [];
  selectedRoom: Room | null = null;
  editingRoomId: number | null = null;

  isFormModalOpen = false;
  isDetailModalOpen = false;

  isLoadingList = false;
  isLoadingDetail = false;
  isLoadingSpecialties = false;
  isSubmitting = false;

  feedbackType: 'success' | 'error' = 'success';
  feedbackMessage = '';
  private bodyOverflowBeforeModal = '';

  currentPage = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    floor: [''],
    specialty_id: [0, [Validators.required, Validators.min(1)]],
    status: ['Available', [Validators.required]],
    description: ['']
  });

  get nameControl() {
    return this.form.controls.name;
  }

  get specialtyControl() {
    return this.form.controls.specialty_id;
  }

  get canManageRooms(): boolean {
    return this.currentRole === 'ADMIN';
  }

  ngOnInit(): void {
    this.loadList();
    this.loadSpecialties();
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
    if (!this.canManageRooms) {
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
    this.selectedRoom = null;
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingRoomId = null;
    this.form.reset({
      name: '',
      floor: '',
      specialty_id: 0,
      status: 'Available',
      description: ''
    });
  }

  startEdit(room: Room): void {
    if (!this.canManageRooms) {
      return;
    }

    this.feedbackMessage = '';
    this.editingRoomId = room.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
    this.form.reset({
      name: room.name,
      floor: room.floor === null ? '' : String(room.floor),
      specialty_id: room.specialty_id,
      status: room.status,
      description: room.description ?? ''
    });
  }

  onViewMore(id: number): void {
    this.feedbackMessage = '';
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;

    this.roomsApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedRoom = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết phòng.');
        this.closeDetailModal();
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  onSubmit(): void {
    if (!this.canManageRooms) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    const raw = this.form.getRawValue();
    const specialtyId = Number(raw.specialty_id);
    const floorValue = `${raw.floor}`.trim();
    const normalizedStatus: RoomStatus = raw.status === 'Maintenance' ? 'Maintenance' : 'Available';
    const normalizedFloor = floorValue === '' ? null : Number(floorValue);

    const payload: RoomUpsertPayload = {
      name: raw.name.trim(),
      specialty_id: specialtyId,
      status: normalizedStatus,
      floor: normalizedFloor,
      description: raw.description.trim() || null
    };

    if (!payload.name) {
      this.nameControl.setErrors({ required: true });
      this.nameControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!Number.isInteger(payload.specialty_id) || payload.specialty_id <= 0) {
      this.specialtyControl.setErrors({ required: true });
      this.specialtyControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (normalizedFloor !== null && (!Number.isInteger(normalizedFloor) || normalizedFloor < 0)) {
      this.showFeedback('error', 'Tầng phải là số nguyên không âm.');
      this.isSubmitting = false;
      return;
    }

    if (this.editingRoomId) {
      this.updateRoom(this.editingRoomId, payload);
      return;
    }

    this.createRoom(payload);
  }

  onDelete(room: Room): void {
    if (!this.canManageRooms) {
      return;
    }

    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa phòng \"${room.name}\"?`);
    if (!shouldDelete) {
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    this.roomsApiService.delete(room.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa phòng thành công.');

        if (this.selectedRoom?.id === room.id) {
          this.closeDetailModal();
        }

        if (this.editingRoomId === room.id) {
          this.startCreateMode();
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa phòng.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  shortDescription(value: string | null): string {
    if (!value) {
      return 'Không có mô tả';
    }

    return value.length > 70 ? `${value.slice(0, 70)}...` : value;
  }

  get pagedRooms(): Room[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.rooms.slice(startIndex, startIndex + this.pageSize);
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

    this.roomsApiService.getAll().subscribe({
      next: (response) => {
        this.rooms = response.data;
        this.ensureValidPage();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách phòng.');
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

  private createRoom(payload: RoomUpsertPayload): void {
    this.roomsApiService.create(payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Tạo phòng thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tạo phòng.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateRoom(id: number, payload: RoomUpsertPayload): void {
    this.roomsApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Cập nhật phòng thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedRoom?.id === id) {
          this.selectedRoom = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật phòng.');
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
    const totalPages = Math.max(1, Math.ceil(this.rooms.length / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
  }
}
