import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { NotificationService } from '../../../core/services/notification.service';
import { getWorkScheduleBlockStatusLabel } from '../../../shared/enum-label.util';
import { Doctor } from '../../doctors/models/doctors.model';
import { DoctorsApiService } from '../../doctors/services/doctors.api';
import {
  WorkScheduleBlock,
  WorkScheduleBlockReviewPayload,
  WorkScheduleBlockStatus,
  WorkScheduleBlockUpsertPayload
} from '../models/work-schedule-blocks.model';
import { WorkScheduleBlockDetailModalComponent } from './work-schedule-block-detail/work-schedule-block-detail-modal.component';
import { WorkScheduleBlocksApiService } from '../services/work-schedule-blocks.api';
import { WorkScheduleBlockFormModalComponent } from './work-schedule-block-form/work-schedule-block-form-modal.component';
import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-work-schedule-blocks-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WorkScheduleBlockFormModalComponent, WorkScheduleBlockDetailModalComponent, SharedPaginationComponent],
  templateUrl: './work-schedule-blocks-page.component.html',
  styleUrl: './work-schedule-blocks-page.component.scss'
})
export class WorkScheduleBlocksPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly workScheduleBlocksApiService = inject(WorkScheduleBlocksApiService);
  private readonly doctorsApiService = inject(DoctorsApiService);
  private readonly tokenService = inject(TokenService);
  private readonly notificationService = inject(NotificationService);

  blocks: WorkScheduleBlock[] = [];
  doctors: Doctor[] = [];
  selectedBlock: WorkScheduleBlock | null = null;
  editingBlockId: number | null = null;

  isFormModalOpen = false;
  isDetailModalOpen = false;
  isLoadingList = false;
  isLoadingDetail = false;
  isLoadingDoctors = false;
  isSubmitting = false;

  feedbackMessage = '';
  private bodyOverflowBeforeModal = '';

  selectedDoctorId = 0;
  selectedStatus: WorkScheduleBlockStatus | 'ALL' = 'ALL';
  activeTab: 'requests' | 'approved' = 'requests';
  viewMode: 'day' | 'week' = 'day';
  selectedDate = '';
  dayCurrentPage = 1;
  dayPageSize = 10;
  readonly dayPageSizeOptions = [10, 20, 50];
  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();
  private readonly currentUser = this.tokenService.getCurrentUser();
  private readonly currentUserId = this.resolveCurrentUserId();
  private currentDoctorId: number | null = null;

  readonly form = this.fb.nonNullable.group({
    doctor_id: [0, [Validators.required, Validators.min(1)]],
    date: [this.getTodayValue(), [Validators.required]],
    is_off: [false],
    start_time: ['08:00'],
    end_time: ['12:00'],
    reason: ['']
  });

  get doctorControl() {
    return this.form.controls.doctor_id;
  }

  get dateControl() {
    return this.form.controls.date;
  }

  get startTimeControl() {
    return this.form.controls.start_time;
  }

  get endTimeControl() {
    return this.form.controls.end_time;
  }

  get reasonControl() {
    return this.form.controls.reason;
  }

  get isOffControl() {
    return this.form.controls.is_off;
  }

  ngOnInit(): void {
    if (this.isDoctorView) {
      this.doctorControl.disable({ emitEvent: false });
    }

    this.loadList();
    this.loadDoctors();
    this.applyBlockStateValidators(this.isOffControl.value);
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

  updateSelectedStatus(value: WorkScheduleBlockStatus | 'ALL' | string): void {
    this.selectedStatus = (value as WorkScheduleBlockStatus | 'ALL') || 'ALL';
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  setViewMode(mode: 'day' | 'week'): void {
    this.viewMode = mode;
    if (mode === 'day') {
      this.dayCurrentPage = 1;
      this.ensureDayPageValid();
    }
  }

  setActiveTab(tab: 'requests' | 'approved'): void {
    if (this.isReceptionistView && tab !== 'approved') {
      return;
    }

    this.activeTab = tab;
    if (tab === 'approved') {
      this.selectedStatus = 'ALL';
    }
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  updateSelectedDoctor(value: string | number): void {
    this.selectedDoctorId = Number(value) || 0;
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  updateSelectedDate(value: string): void {
    this.selectedDate = value || '';
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  goToPreviousWeek(): void {
    this.shiftSelectedDateByDays(-7);
    this.viewMode = 'week';
  }

  goToNextWeek(): void {
    this.shiftSelectedDateByDays(7);
    this.viewMode = 'week';
  }

  goToToday(): void {
    this.selectedDate = this.getTodayValue();
  }

  clearSelectedDate(): void {
    this.selectedDate = '';
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  openCreateModal(): void {
    if (!this.canCreateBlocks) {
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
    this.selectedBlock = null;
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingBlockId = null;
    const defaultDoctorId = this.isDoctorView ? (this.currentDoctorId ?? 0) : 0;

    this.form.reset({
      doctor_id: defaultDoctorId,
      date: this.getTodayValue(),
      is_off: false,
      start_time: '08:00',
      end_time: '12:00',
      reason: ''
    });
    this.applyBlockStateValidators(false);
  }

  startEdit(block: WorkScheduleBlock): void {
    if (!this.canEditBlock(block)) {
      return;
    }

    this.feedbackMessage = '';
    this.editingBlockId = block.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();

    const doctorId = this.isDoctorView ? (this.currentDoctorId ?? block.doctor_id) : block.doctor_id;
    this.form.reset({
      doctor_id: doctorId,
      date: block.date,
      is_off: block.is_off,
      start_time: block.start_time?.slice(0, 5) ?? '',
      end_time: block.end_time?.slice(0, 5) ?? '',
      reason: block.reason ?? ''
    });
    this.applyBlockStateValidators(block.is_off);
  }

  onViewMore(id: number): void {
    this.feedbackMessage = '';
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;

    this.workScheduleBlocksApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedBlock = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết lịch nghỉ.');
        this.closeDetailModal();
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  onOffStateChanged(isOff: boolean | Event): void {
    const normalizedValue =
      typeof isOff === 'boolean' ? isOff : ((isOff.target as HTMLInputElement | null)?.checked ?? false);

    this.applyBlockStateValidators(normalizedValue);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    const raw = this.form.getRawValue();
    const isOff = Boolean(raw.is_off);
    const doctorId = this.isDoctorView ? (this.currentDoctorId ?? 0) : Number(raw.doctor_id);

    if (this.isDoctorView && doctorId <= 0) {
      this.showFeedback('error', 'Không xác định được hồ sơ bác sĩ của bạn. Vui lòng tải lại trang.');
      this.isSubmitting = false;
      return;
    }

    const payload: WorkScheduleBlockUpsertPayload = {
      doctor_id: doctorId,
      date: raw.date.trim(),
      is_off: isOff,
      reason: raw.reason.trim() || null
    };

    if (!Number.isInteger(payload.doctor_id) || payload.doctor_id <= 0) {
      this.doctorControl.setErrors({ required: true });
      this.doctorControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!payload.date) {
      this.dateControl.setErrors({ required: true });
      this.dateControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!isOff) {
      const startTime = raw.start_time.trim();
      const endTime = raw.end_time.trim();

      if (!startTime || !endTime) {
        this.showFeedback('error', 'Vui lòng nhập giờ bắt đầu và giờ kết thúc.');
        this.isSubmitting = false;
        return;
      }

      if (!this.isValidTimeRange(startTime, endTime)) {
        this.showFeedback('error', 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc.');
        this.isSubmitting = false;
        return;
      }

      payload.start_time = startTime;
      payload.end_time = endTime;
    } else {
      payload.start_time = null;
      payload.end_time = null;
    }

    if (this.editingBlockId) {
      this.updateBlock(this.editingBlockId, payload);
      return;
    }

    this.createBlock(payload);
  }

  onDelete(block: WorkScheduleBlock): void {
    if (!this.canDeleteBlock(block)) {
      return;
    }

    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa yêu cầu nghỉ #${block.id}?`);
    if (!shouldDelete) {
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    this.workScheduleBlocksApiService.delete(block.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa lịch nghỉ thành công.');

        if (this.selectedBlock?.id === block.id) {
          this.closeDetailModal();
        }

        if (this.editingBlockId === block.id) {
          this.startCreateMode();
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa lịch nghỉ.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  displayDoctorName(block: WorkScheduleBlock): string {
    return block.Doctor?.User?.fullname || block.Doctor?.User?.username || `Doctor ${block.doctor_id}`;
  }

  getWorkScheduleBlockStatusLabel(status: string | null | undefined): string {
    return getWorkScheduleBlockStatusLabel(status);
  }

  formatDate(value: string): string {
    if (!value) {
      return '--';
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  formatTime(value: string | null | undefined): string {
    return value ? value.slice(0, 5) : '--';
  }

  doctorOptionLabel(doctor: Doctor): string {
    return doctor.User?.fullname || doctor.User?.username || `Bac si #${doctor.id}`;
  }

  get dayBlocks(): WorkScheduleBlock[] {
    const filteredBlocks = this.getFilteredBlocks();
    if (!this.selectedDate) {
      return filteredBlocks;
    }

    return filteredBlocks.filter((block) => block.date === this.selectedDate);
  }

  get pagedDayBlocks(): WorkScheduleBlock[] {
    const startIndex = (this.dayCurrentPage - 1) * this.dayPageSize;
    return this.dayBlocks.slice(startIndex, startIndex + this.dayPageSize);
  }

  get dayRowOffset(): number {
    return (this.dayCurrentPage - 1) * this.dayPageSize;
  }

  onDayPageChange(page: number): void {
    this.dayCurrentPage = page;
  }

  onDayPageSizeChange(pageSize: number): void {
    this.dayPageSize = pageSize;
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  get weekDayBlocks(): Array<{
    dateKey: string;
    dayLabel: string;
    dateLabel: string;
    blocks: WorkScheduleBlock[];
    doctorGroups: Array<{
      doctorId: number;
      doctorName: string;
      blocks: WorkScheduleBlock[];
    }>;
  }> {
    const weekStart = this.getWeekStart(this.selectedDateObject);
    const filteredBlocks = this.getFilteredBlocks();
    const results: Array<{
      dateKey: string;
      dayLabel: string;
      dateLabel: string;
      blocks: WorkScheduleBlock[];
      doctorGroups: Array<{
        doctorId: number;
        doctorName: string;
        blocks: WorkScheduleBlock[];
      }>;
    }> = [];

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const dateKey = this.toDateInputValue(date);
      const dayBlocks = filteredBlocks.filter((block) => block.date === dateKey);

      results.push({
        dateKey,
        dayLabel: this.dayLabel(date),
        dateLabel: this.formatDateLabel(date),
        blocks: dayBlocks,
        doctorGroups: this.buildDoctorGroups(dayBlocks)
      });
    }

    return results;
  }

  get hasAnyWeekBlock(): boolean {
    return this.weekDayBlocks.some((item) => item.blocks.length > 0);
  }

  get doctorFilterLabel(): string {
    if (!this.selectedDoctorId) {
      return 'Tất cả bác sĩ';
    }

    const doctor = this.doctors.find((item) => item.id === this.selectedDoctorId);
    return doctor ? this.doctorOptionLabel(doctor) : `Bac si #${this.selectedDoctorId}`;
  }

  get selectedWeekRangeLabel(): string {
    const start = this.getWeekStart(this.selectedDateObject);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${this.formatDateLabel(start)} - ${this.formatDateLabel(end)}`;
  }

  get isDoctorView(): boolean {
    return this.currentRole === 'DOCTOR';
  }

  get isAdminView(): boolean {
    return this.currentRole === 'ADMIN';
  }

  get isReceptionistView(): boolean {
    return this.currentRole === 'RECEPTIONIST';
  }

  get canCreateBlocks(): boolean {
    return this.isDoctorView;
  }

  get canReviewBlocks(): boolean {
    return this.isAdminView;
  }

  get showRequestTabs(): boolean {
    return this.isAdminView || this.isDoctorView;
  }

  get visibleStatusOptions(): Array<{ value: WorkScheduleBlockStatus | 'ALL'; label: string }> {
    if (!this.isAdminView || this.activeTab !== 'requests') {
      return [];
    }

    return [
      { value: 'ALL', label: 'Tất cả trạng thái yêu cầu' },
      { value: 'Pending', label: 'Chờ duyệt' },
      { value: 'Rejected', label: 'Từ chối' },
    ];
  }

  get activeTabLabel(): string {
    return this.activeTab === 'approved' ? 'Lịch nghỉ đã duyệt' : 'Yêu cầu nghỉ';
  }

  get selectedDateLabel(): string {
    return this.selectedDate || 'Tất cả ngày';
  }

  get sectionTitle(): string {
    if (this.isDoctorView) {
      return this.activeTab === 'approved' ? 'Lịch nghỉ của tôi' : 'Yêu cầu nghỉ của tôi';
    }

    if (this.isAdminView) {
      return this.activeTab === 'approved' ? 'Danh sách lịch nghỉ đã duyệt' : 'Danh sách yêu cầu nghỉ';
    }

    return 'Lịch nghỉ bác sĩ';
  }

  canEditBlock(block: WorkScheduleBlock): boolean {
    return this.isDoctorView && (block.status === 'Pending' || block.status === 'Rejected');
  }

  canDeleteBlock(block: WorkScheduleBlock): boolean {
    return this.canEditBlock(block);
  }

  onApprove(block: WorkScheduleBlock): void {
    this.reviewBlock(block, {
      status: 'Approved',
      review_note: null
    });
  }

  onReject(block: WorkScheduleBlock): void {
    const reviewNote = globalThis.prompt('Nhập lý do từ chối (không bắt buộc):', block.review_note ?? '') ?? null;
    this.reviewBlock(block, {
      status: 'Rejected',
      review_note: reviewNote
    });
  }

  private loadList(): void {
    this.isLoadingList = true;
    this.feedbackMessage = '';

    this.workScheduleBlocksApiService.getAll().subscribe({
      next: (response) => {
        this.blocks = response.data;
        this.ensureDayPageValid();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách lịch nghỉ.');
      },
      complete: () => {
        this.isLoadingList = false;
      }
    });
  }

  private loadDoctors(): void {
    this.isLoadingDoctors = true;

    this.doctorsApiService.getAll().subscribe({
      next: (response) => {
        this.doctors = response.data;

        if (this.isDoctorView) {
          this.currentDoctorId = this.resolveCurrentDoctorId();

          if (this.currentDoctorId) {
            this.selectedDoctorId = this.currentDoctorId;
            this.doctorControl.setValue(this.currentDoctorId, { emitEvent: false });
          }
        }
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách bác sĩ.');
      },
      complete: () => {
        this.isLoadingDoctors = false;
      }
    });
  }

  private createBlock(payload: WorkScheduleBlockUpsertPayload): void {
    this.workScheduleBlocksApiService.create(payload).subscribe({
      next: () => {
        this.showFeedback('success', 'Gửi yêu cầu nghỉ thành công. Yêu cầu đang chờ Quản trị viên duyệt.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể gửi yêu cầu nghỉ.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateBlock(id: number, payload: WorkScheduleBlockUpsertPayload): void {
    this.workScheduleBlocksApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', 'Cập nhật yêu cầu nghỉ thành công. Yêu cầu đã được gửi lại để chờ duyệt.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedBlock?.id === id) {
          this.selectedBlock = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật yêu cầu nghỉ.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private reviewBlock(block: WorkScheduleBlock, payload: WorkScheduleBlockReviewPayload): void {
    if (!this.canReviewBlocks || block.status !== 'Pending') {
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    this.workScheduleBlocksApiService.review(block.id, payload).subscribe({
      next: (response) => {
        this.showFeedback(
          'success',
          payload.status === 'Approved'
            ? 'Duyệt yêu cầu nghỉ thành công.'
            : 'Từ chối yêu cầu nghỉ thành công.'
        );

        if (this.selectedBlock?.id === block.id) {
          this.selectedBlock = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback(
          'error',
          error.error?.message ??
            (payload.status === 'Approved'
              ? 'Không thể duyệt yêu cầu nghỉ.'
              : 'Không thể từ chối yêu cầu nghỉ.')
        );
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private showFeedback(type: 'success' | 'error', message: string): void {
    if (type === 'success') {
      this.notificationService.success(message);
    } else {
      this.notificationService.error(message);
    }

    this.feedbackMessage = '';
  }

  private getFilteredBlocks(): WorkScheduleBlock[] {
    const byDoctor = this.selectedDoctorId
      ? this.blocks.filter((block) => block.doctor_id === this.selectedDoctorId)
      : this.blocks;

    const byTab = this.activeTab === 'approved'
      ? byDoctor.filter((block) => block.status === 'Approved')
      : byDoctor.filter((block) => block.status !== 'Approved');

    const list = this.selectedStatus === 'ALL'
      ? byTab
      : byTab.filter((block) => block.status === this.selectedStatus);

    return [...list].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      return (left.start_time || '00:00').localeCompare(right.start_time || '00:00');
    });
  }

  private buildDoctorGroups(blocks: WorkScheduleBlock[]): Array<{
    doctorId: number;
    doctorName: string;
    blocks: WorkScheduleBlock[];
  }> {
    if (this.selectedDoctorId) {
      return [];
    }

    const groups = new Map<number, WorkScheduleBlock[]>();

    for (const block of blocks) {
      const list = groups.get(block.doctor_id) ?? [];
      list.push(block);
      groups.set(block.doctor_id, list);
    }

    return Array.from(groups.entries())
      .map(([doctorId, doctorBlocks]) => {
        const sample = doctorBlocks[0];
        return {
          doctorId,
          doctorName: sample ? this.displayDoctorName(sample) : `Bac si #${doctorId}`,
          blocks: doctorBlocks
        };
      })
      .sort((left, right) => left.doctorName.localeCompare(right.doctorName));
  }

  private dayLabel(date: Date): string {
    const labels = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    return labels[date.getDay()] || '--';
  }

  private get selectedDateObject(): Date {
    const parsed = new Date(`${this.selectedDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private shiftSelectedDateByDays(dayOffset: number): void {
    const base = this.selectedDateObject;
    base.setDate(base.getDate() + dayOffset);
    this.selectedDate = this.toDateInputValue(base);
  }

  private formatDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  private ensureDayPageValid(): void {
    const totalPages = Math.max(1, Math.ceil(this.dayBlocks.length / this.dayPageSize));
    if (this.dayCurrentPage > totalPages) {
      this.dayCurrentPage = totalPages;
    }
  }

  private isValidTimeRange(startTime: string, endTime: string): boolean {
    const start = this.timeToSeconds(startTime);
    const end = this.timeToSeconds(endTime);
    return Number.isFinite(start) && Number.isFinite(end) && start < end;
  }

  private timeToSeconds(value: string): number {
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
      return Number.NaN;
    }

    const [hours, minutes, seconds = 0] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  private applyBlockStateValidators(isOff: boolean): void {
    if (isOff) {
      this.startTimeControl.setValidators([]);
      this.endTimeControl.setValidators([]);
      this.startTimeControl.setErrors(null);
      this.endTimeControl.setErrors(null);
    } else {
      this.startTimeControl.setValidators([Validators.required]);
      this.endTimeControl.setValidators([Validators.required]);
    }

    this.startTimeControl.updateValueAndValidity({ emitEvent: false });
    this.endTimeControl.updateValueAndValidity({ emitEvent: false });
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

  private getTodayValue(): string {
    return this.toDateInputValue(new Date());
  }

  private resolveCurrentUserId(): number | null {
    if (!this.currentUser) {
      return null;
    }

    return this.getPositiveNumberFromUnknown(this.currentUser['id']);
  }

  private resolveCurrentDoctorId(): number | null {
    const fromCurrentUser =
      this.getPositiveNumberFromUnknown(this.currentUser?.['doctor_id']) ??
      this.getPositiveNumberFromUnknown(this.currentUser?.['doctorId']) ??
      this.getPositiveNumberFromUnknown(
        typeof this.currentUser?.['Doctor'] === 'object' && this.currentUser['Doctor'] !== null
          ? (this.currentUser['Doctor'] as Record<string, unknown>)['id']
          : null
      );

    if (fromCurrentUser) {
      return fromCurrentUser;
    }

    if (!this.currentUserId) {
      return null;
    }

    const doctor = this.doctors.find((item) => item.user_id === this.currentUserId);
    return doctor?.id ?? null;
  }

  private getPositiveNumberFromUnknown(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
