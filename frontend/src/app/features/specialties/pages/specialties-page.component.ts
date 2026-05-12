import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { BackendRole } from '../../../core/models/auth-role.model';
import { NotificationService } from '../../../core/services/notification.service';
import { TokenService } from '../../../core/services/token.service';
import { SpecialtyDetailModalComponent } from './specialty-detail/specialty-detail-modal.component';
import { SpecialtyFormModalComponent } from './specialty-form/specialty-form-modal.component';
import { Room } from '../../rooms/models/rooms.model';
import { RoomsApiService } from '../../rooms/services/rooms.api';
import { Specialty, SpecialtyUpsertPayload } from '../models/specialties.model';
import { SpecialtiesApiService } from '../services/specialties.api';
import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-specialties-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SpecialtyFormModalComponent, SpecialtyDetailModalComponent, SharedPaginationComponent],
  templateUrl: './specialties-page.component.html',
  styleUrl: './specialties-page.component.scss'
})
export class SpecialtiesPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly specialtiesApiService = inject(SpecialtiesApiService);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly tokenService = inject(TokenService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchTermChanges = new Subject<string>();
  private readonly subscriptions = new Subscription();

  specialties: Specialty[] = [];
  rooms: Room[] = [];
  selectedSpecialty: Specialty | null = null;
  editingSpecialtyId: number | null = null;
  isFormModalOpen = false;
  isDetailModalOpen = false;

  isLoadingList = false;
  isLoadingRooms = false;
  isLoadingDetail = false;
  isSubmitting = false;

  private bodyOverflowBeforeModal = '';

  searchTerm = '';
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  readonly pageSizeOptions = [10, 20, 50];
  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: ['']
  });

  get nameControl() {
    return this.form.controls.name;
  }

  get canManageSpecialties(): boolean {
    return this.currentRole === 'ADMIN';
  }

  get isReceptionistView(): boolean {
    return this.currentRole === 'RECEPTIONIST';
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.searchTerm = params.get('q') ?? '';
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

    this.loadRooms();
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
    this.currentPage = 1;
    this.updateQueryParams(true);
  }

  openCreateModal(): void {
    if (!this.canManageSpecialties) {
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
    this.selectedSpecialty = null;
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingSpecialtyId = null;
    this.form.reset({ name: '', description: '' });
  }

  startEdit(specialty: Specialty): void {
    if (!this.canManageSpecialties) {
      return;
    }

    this.editingSpecialtyId = specialty.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
    this.form.reset({
      name: specialty.name,
      description: specialty.description ?? ''
    });
  }

  onViewMore(id: number): void {
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;

    this.specialtiesApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedSpecialty = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết chuyên khoa.');
        this.closeDetailModal();
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  onSubmit(): void {
    if (!this.canManageSpecialties) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const raw = this.form.getRawValue();
    const payload: SpecialtyUpsertPayload = {
      name: raw.name.trim(),
      description: raw.description.trim() || null
    };

    if (!payload.name) {
      this.nameControl.setErrors({ required: true });
      this.nameControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (this.editingSpecialtyId) {
      this.updateSpecialty(this.editingSpecialtyId, payload);
      return;
    }

    this.createSpecialty(payload);
  }

  onDelete(specialty: Specialty): void {
    if (!this.canManageSpecialties) {
      return;
    }

    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa chuyên khoa \"${specialty.name}\"?`);
    if (!shouldDelete) {
      return;
    }

    this.isSubmitting = true;

    this.specialtiesApiService.delete(specialty.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa chuyên khoa thành công.');
        if (this.selectedSpecialty?.id === specialty.id) {
          this.closeDetailModal();
        }

        if (this.editingSpecialtyId === specialty.id) {
          this.startCreateMode();
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa chuyên khoa.');
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

  getRoomsForSpecialty(specialtyId: number): Room[] {
    return this.rooms
      .filter((room) => room.specialty_id === specialtyId)
      .sort((left, right) => {
        const floorDelta = (left.floor ?? 0) - (right.floor ?? 0);
        return floorDelta || left.name.localeCompare(right.name, 'vi');
      });
  }

  getRoomStatusLabel(status: Room['status']): string {
    return status === 'Available' ? 'Sẵn sàng' : 'Bảo trì';
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
    this.specialtiesApiService.getAll({
      q: this.searchTerm,
      page: this.currentPage,
      page_size: this.pageSize
    }).subscribe({
      next: (response) => {
        this.specialties = response.data;
        this.totalItems = response.pagination?.total_items ?? response.data.length;
        this.currentPage = response.pagination?.page ?? this.currentPage;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách chuyên khoa.');
      },
      complete: () => {
        this.isLoadingList = false;
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
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách phòng theo chuyên khoa.');
      },
      complete: () => {
        this.isLoadingRooms = false;
      }
    });
  }

  private createSpecialty(payload: SpecialtyUpsertPayload): void {
    this.specialtiesApiService.create(payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Tạo chuyên khoa thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tạo chuyên khoa.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateSpecialty(id: number, payload: SpecialtyUpsertPayload): void {
    this.specialtiesApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Cập nhật chuyên khoa thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedSpecialty?.id === id) {
          this.selectedSpecialty = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật chuyên khoa.');
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
}
