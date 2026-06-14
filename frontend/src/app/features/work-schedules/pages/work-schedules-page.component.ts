import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BackendRole } from '../../../core/models/auth-role.model';
import { NotificationService } from '../../../core/services/notification.service';
import { TokenService } from '../../../core/services/token.service';
import { Doctor } from '../../doctors/models/doctors.model';
import { DoctorsApiService } from '../../doctors/services/doctors.api';
import { WorkScheduleBlock } from '../../work-schedule-blocks/models/work-schedule-blocks.model';
import { WorkScheduleBlocksApiService } from '../../work-schedule-blocks/services/work-schedule-blocks.api';
import { WorkSchedule, WorkScheduleDayOfWeek, WorkScheduleUpsertPayload } from '../models/work-schedules.model';
import { WorkScheduleDetailModalComponent } from './work-schedule-detail/work-schedule-detail-modal.component';
import { WorkSchedulesApiService } from '../services/work-schedules.api';
import { WorkScheduleFormModalComponent } from './work-schedule-form/work-schedule-form-modal.component';
import { SharedPaginationComponent } from '../../../shared/components/pagination/pagination.component';

type ReceptionistScheduleFilter = 'ALL' | 'WORKING' | 'ON_LEAVE' | 'WORKING_AND_LEAVE' | 'NO_WORKING';
type ReceptionistCalendarCellState = 'WORKING' | 'ON_LEAVE' | 'WORKING_AND_LEAVE' | 'NO_WORKING';

@Component({
  selector: 'app-work-schedules-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WorkScheduleFormModalComponent, WorkScheduleDetailModalComponent, SharedPaginationComponent],
  templateUrl: './work-schedules-page.component.html',
  styleUrl: './work-schedules-page.component.scss'
})
export class WorkSchedulesPageComponent implements OnInit, OnDestroy {
  private static readonly WORKDAY_START_MINUTES = 6 * 60;
  private static readonly WORKDAY_END_MINUTES = 22 * 60;
  private static readonly TIME_SLOT_STEP_MINUTES = 30;

  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workSchedulesApiService = inject(WorkSchedulesApiService);
  private readonly doctorsApiService = inject(DoctorsApiService);
  private readonly workScheduleBlocksApiService = inject(WorkScheduleBlocksApiService);
  private readonly tokenService = inject(TokenService);
  private readonly notificationService = inject(NotificationService);

  schedules: WorkSchedule[] = [];
  doctors: Doctor[] = [];
  approvedScheduleBlocks: WorkScheduleBlock[] = [];
  selectedSchedule: WorkSchedule | null = null;
  editingScheduleId: number | null = null;

  isFormModalOpen = false;
  isDetailModalOpen = false;
  isLoadingList = false;
  isLoadingDetail = false;
  isLoadingDoctors = false;
  isLoadingApprovedBlocks = false;
  isSubmitting = false;

  feedbackType: 'success' | 'error' = 'success';
  feedbackMessage = '';
  private bodyOverflowBeforeModal = '';

  selectedDoctorId = 0;
  viewMode: 'day' | 'week' = 'day';
  selectedDate = this.getTodayDateInputValue();
  receptionistScheduleFilter: ReceptionistScheduleFilter = 'ALL';
  dayCurrentPage = 1;
  dayPageSize = 10;
  readonly dayPageSizeOptions = [10, 20, 50];
  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  readonly dayOptions: Array<{ value: WorkScheduleDayOfWeek; label: string }> = [
    { value: 0, label: 'Chủ nhật' },
    { value: 1, label: 'Thứ hai' },
    { value: 2, label: 'Thứ ba' },
    { value: 3, label: 'Thứ tư' },
    { value: 4, label: 'Thứ năm' },
    { value: 5, label: 'Thứ sáu' },
    { value: 6, label: 'Thứ bảy' }
  ];

  readonly receptionistScheduleFilterOptions: Array<{ value: ReceptionistScheduleFilter; label: string }> = [
    { value: 'ALL', label: 'Tất cả lịch' },
    { value: 'WORKING', label: 'Có ca làm việc' },
    { value: 'ON_LEAVE', label: 'Có lịch nghỉ' },
    { value: 'WORKING_AND_LEAVE', label: 'Có ca và có nghỉ' },
    { value: 'NO_WORKING', label: 'Không có ca làm việc' }
  ];

  readonly form = this.fb.nonNullable.group({
    doctor_id: [0, [Validators.required, Validators.min(1)]],
    day_of_week: [0 as WorkScheduleDayOfWeek, [Validators.required]],
    start_time: ['', [Validators.required]],
    end_time: ['', [Validators.required]]
  });

  get doctorControl() {
    return this.form.controls.doctor_id;
  }

  get dayControl() {
    return this.form.controls.day_of_week;
  }

  get startTimeControl() {
    return this.form.controls.start_time;
  }

  get endTimeControl() {
    return this.form.controls.end_time;
  }

  ngOnInit(): void {
    this.bindFormAvailabilityState();
    this.loadList();
    this.loadDoctors();
    if (this.isReceptionistView) {
      this.loadApprovedScheduleBlocks();
    }
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

  setViewMode(mode: 'day' | 'week'): void {
    this.viewMode = mode;
    if (mode === 'day') {
      this.dayCurrentPage = 1;
      this.ensureDayPageValid();
    }
  }

  updateSelectedDoctor(value: string | number): void {
    this.selectedDoctorId = Number(value) || 0;
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  updateSelectedDate(value: string): void {
    this.selectedDate = value || this.getTodayDateInputValue();
    this.dayCurrentPage = 1;
    this.ensureDayPageValid();
  }

  updateReceptionistScheduleFilter(value: ReceptionistScheduleFilter): void {
    this.receptionistScheduleFilter = value;
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
    this.selectedDate = this.getTodayDateInputValue();
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
    this.selectedSchedule = null;
    this.updateBodyScrollState();
  }

  startCreateMode(): void {
    this.editingScheduleId = null;
    this.form.reset({
      doctor_id: 0,
      day_of_week: 0,
      start_time: '',
      end_time: ''
    });
  }

  startEdit(schedule: WorkSchedule): void {
    this.feedbackMessage = '';
    this.editingScheduleId = schedule.id;
    this.isFormModalOpen = true;
    this.updateBodyScrollState();
    this.form.reset({
      doctor_id: schedule.doctor_id,
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time.slice(0, 5),
      end_time: schedule.end_time.slice(0, 5)
    });
  }

  onViewMore(id: number): void {
    this.feedbackMessage = '';
    this.isDetailModalOpen = true;
    this.updateBodyScrollState();
    this.isLoadingDetail = true;

    this.workSchedulesApiService.getById(id).subscribe({
      next: (response) => {
        this.selectedSchedule = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể lấy chi tiết lịch làm việc.');
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

    this.feedbackMessage = '';
    this.isSubmitting = true;

    const raw = this.form.getRawValue();
    const payload: WorkScheduleUpsertPayload = {
      doctor_id: Number(raw.doctor_id),
      day_of_week: Number(raw.day_of_week) as WorkScheduleDayOfWeek,
      start_time: raw.start_time.trim(),
      end_time: raw.end_time.trim()
    };

    if (!Number.isInteger(payload.doctor_id) || payload.doctor_id <= 0) {
      this.doctorControl.setErrors({ required: true });
      this.doctorControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!Number.isInteger(payload.day_of_week) || payload.day_of_week < 0 || payload.day_of_week > 6) {
      this.dayControl.setErrors({ required: true });
      this.dayControl.markAsTouched();
      this.isSubmitting = false;
      return;
    }

    if (!this.isValidTimeRange(payload.start_time, payload.end_time)) {
      this.showFeedback('error', 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc và tối thiểu 30 phút.');
      this.isSubmitting = false;
      return;
    }

    if (!this.availableStartTimeOptions.includes(payload.start_time)) {
      this.showFeedback('error', 'Giờ bắt đầu đã không còn phù hợp với phòng này. Vui lòng chọn lại.');
      this.isSubmitting = false;
      return;
    }

    if (!this.availableEndTimeOptions.includes(payload.end_time)) {
      this.showFeedback('error', 'Giờ kết thúc đã không còn phù hợp với phòng này. Vui lòng chọn lại.');
      this.isSubmitting = false;
      return;
    }

    if (this.editingScheduleId) {
      this.updateSchedule(this.editingScheduleId, payload);
      return;
    }

    this.createSchedule(payload);
  }

  onDelete(schedule: WorkSchedule): void {
    const shouldDelete = globalThis.confirm(`Bạn có chắc chắn muốn xóa lịch #${schedule.id}?`);
    if (!shouldDelete) {
      return;
    }

    this.feedbackMessage = '';
    this.isSubmitting = true;

    this.workSchedulesApiService.delete(schedule.id).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Xóa lịch làm việc thành công.');
        if (this.selectedSchedule?.id === schedule.id) {
          this.closeDetailModal();
        }
        if (this.editingScheduleId === schedule.id) {
          this.startCreateMode();
        }
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể xóa lịch làm việc.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  displayDoctorName(schedule: WorkSchedule): string {
    return (
      schedule.Doctor?.User?.fullname ||
      schedule.Doctor?.User?.username ||
      `Doctor ${schedule.doctor_id}`
    );
  }

  dayLabel(dayOfWeek: WorkScheduleDayOfWeek): string {
    return this.dayOptions.find((item) => item.value === dayOfWeek)?.label || `${dayOfWeek}`;
  }

  doctorOptionLabel(doctor: Doctor): string {
    return doctor.User?.fullname || doctor.User?.username || `Bác sĩ #${doctor.id}`;
  }

  get activeDayLabel(): string {
    if (this.isDoctorView && this.isSelectedDateToday) {
      return 'Hôm nay';
    }

    return this.dayLabel(this.selectedDayOfWeek);
  }

  get doctorEmptyDayMessage(): string {
    return this.isSelectedDateToday
      ? 'Không có lịch làm việc hôm nay.'
      : 'Không có lịch làm việc trong ngày đã chọn.';
  }

  get daySchedules(): WorkSchedule[] {
    return this.getFilteredSchedules().filter((schedule) => schedule.day_of_week === this.selectedDayOfWeek);
  }

  get pagedDaySchedules(): WorkSchedule[] {
    const startIndex = (this.dayCurrentPage - 1) * this.dayPageSize;
    return this.daySchedules.slice(startIndex, startIndex + this.dayPageSize);
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

  get weekDaySchedules(): Array<{
    day: WorkScheduleDayOfWeek;
    dayLabel: string;
    dateLabel: string;
    schedules: WorkSchedule[];
    doctorGroups: Array<{
      doctorId: number;
      doctorName: string;
      schedules: WorkSchedule[];
    }>;
  }> {
    const weekStart = this.getWeekStart(this.selectedDateObject);
    const filteredSchedules = this.getFilteredSchedules();
    const weekDays = this.dayOptions
      .filter((item) => item.value !== 0)
      .concat(this.dayOptions.filter((item) => item.value === 0));

    return weekDays.map((item, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const daySchedules = filteredSchedules.filter((schedule) => schedule.day_of_week === item.value);

      return {
        day: item.value,
        dayLabel: item.label,
        dateLabel: this.formatDateLabel(date),
        schedules: daySchedules,
        doctorGroups: this.buildDoctorGroups(daySchedules)
      };
    });
  }

  get hasAnyWeekSchedule(): boolean {
    return this.weekDaySchedules.some((item) => item.schedules.length > 0);
  }

  get doctorFilterLabel(): string {
    if (!this.selectedDoctorId) {
      return 'Tất cả bác sĩ';
    }

    const doctor = this.doctors.find((item) => item.id === this.selectedDoctorId);
    return doctor ? this.doctorOptionLabel(doctor) : `Bác sĩ #${this.selectedDoctorId}`;
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

  get isReceptionistView(): boolean {
    return this.currentRole === 'RECEPTIONIST';
  }

  get isLoadingReceptionistDirectory(): boolean {
    return this.isLoadingList || this.isLoadingDoctors || this.isLoadingApprovedBlocks;
  }

  get canManageSchedules(): boolean {
    return this.currentRole === 'ADMIN';
  }

  get receptionistDoctors(): Doctor[] {
    const list = this.selectedDoctorId
      ? this.doctors.filter((doctor) => doctor.id === this.selectedDoctorId)
      : this.doctors;

    return [...list]
      .filter((doctor) => this.matchesReceptionistScheduleFilter(doctor.id))
      .sort((left, right) => this.doctorOptionLabel(left).localeCompare(this.doctorOptionLabel(right)));
  }

  get receptionistBaseDoctorCount(): number {
    return this.selectedDoctorId ? this.doctors.filter((doctor) => doctor.id === this.selectedDoctorId).length : this.doctors.length;
  }

  get receptionistWorkingDoctorCount(): number {
    return this.getReceptionistBaseDoctors().filter((doctor) => this.getSchedulesForDoctorDate(doctor.id).length > 0).length;
  }

  get receptionistLeaveDoctorCount(): number {
    return this.getReceptionistBaseDoctors().filter((doctor) => this.getApprovedBlocksForDoctorDate(doctor.id).length > 0).length;
  }

  get receptionistNoWorkingDoctorCount(): number {
    return this.getReceptionistBaseDoctors().filter((doctor) => this.getSchedulesForDoctorDate(doctor.id).length === 0).length;
  }

  get selectedDateDisplayLabel(): string {
    return this.formatDateLabel(this.selectedDateObject);
  }

  get selectedDateDayLabel(): string {
    return this.dayLabel(this.selectedDayOfWeek);
  }

  get receptionistCalendarDays(): Array<{
    day: WorkScheduleDayOfWeek;
    dayLabel: string;
    dateInput: string;
    dateLabel: string;
    shortDateLabel: string;
    isSelected: boolean;
  }> {
    const weekStart = this.getWeekStart(this.selectedDateObject);
    const weekDays = this.dayOptions
      .filter((item) => item.value !== 0)
      .concat(this.dayOptions.filter((item) => item.value === 0));

    return weekDays.map((item, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const dateInput = this.toDateInputValue(date);

      return {
        day: item.value,
        dayLabel: item.label,
        dateInput,
        dateLabel: this.formatDateLabel(date),
        shortDateLabel: this.formatShortDateLabel(date),
        isSelected: dateInput === this.selectedDate
      };
    });
  }

  getSchedulesForDoctorDate(doctorId: number): WorkSchedule[] {
    return this.schedules
      .filter((schedule) => schedule.doctor_id === doctorId && schedule.day_of_week === this.selectedDayOfWeek)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
  }

  getSchedulesForDoctorCalendarDay(doctorId: number, dayOfWeek: WorkScheduleDayOfWeek): WorkSchedule[] {
    return this.schedules
      .filter((schedule) => schedule.doctor_id === doctorId && schedule.day_of_week === dayOfWeek)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
  }

  getApprovedBlocksForDoctorDate(doctorId: number): WorkScheduleBlock[] {
    return this.approvedScheduleBlocks
      .filter((block) => block.doctor_id === doctorId && block.status === 'Approved' && block.date === this.selectedDate)
      .sort((left, right) => (left.start_time || '').localeCompare(right.start_time || ''));
  }

  getApprovedBlocksForDoctorCalendarDate(doctorId: number, dateInput: string): WorkScheduleBlock[] {
    return this.approvedScheduleBlocks
      .filter((block) => block.doctor_id === doctorId && block.status === 'Approved' && block.date === dateInput)
      .sort((left, right) => (left.start_time || '').localeCompare(right.start_time || ''));
  }

  getReceptionistCalendarCellState(doctorId: number, dayOfWeek: WorkScheduleDayOfWeek, dateInput: string): ReceptionistCalendarCellState {
    const hasWorkingSchedule = this.getSchedulesForDoctorCalendarDay(doctorId, dayOfWeek).length > 0;
    const hasApprovedLeave = this.getApprovedBlocksForDoctorCalendarDate(doctorId, dateInput).length > 0;

    if (hasWorkingSchedule && hasApprovedLeave) {
      return 'WORKING_AND_LEAVE';
    }

    if (hasApprovedLeave) {
      return 'ON_LEAVE';
    }

    if (hasWorkingSchedule) {
      return 'WORKING';
    }

    return 'NO_WORKING';
  }

  getReceptionistCalendarCellClass(doctorId: number, dayOfWeek: WorkScheduleDayOfWeek, dateInput: string): string {
    const state = this.getReceptionistCalendarCellState(doctorId, dayOfWeek, dateInput);

    switch (state) {
      case 'WORKING_AND_LEAVE':
        return 'calendar-cell--mixed';
      case 'ON_LEAVE':
        return 'calendar-cell--leave';
      case 'WORKING':
        return 'calendar-cell--working';
      default:
        return 'calendar-cell--empty';
    }
  }

  getReceptionistCalendarStatusLabel(doctorId: number, dayOfWeek: WorkScheduleDayOfWeek, dateInput: string): string {
    const state = this.getReceptionistCalendarCellState(doctorId, dayOfWeek, dateInput);

    switch (state) {
      case 'WORKING_AND_LEAVE':
        return 'Có ca và nghỉ';
      case 'ON_LEAVE':
        return 'Nghỉ';
      case 'WORKING':
        return 'Có ca';
      default:
        return 'Trống';
    }
  }

  getDoctorRoomLabel(doctor: Doctor): string {
    if (!doctor.Room?.name) {
      return 'Chưa phân phòng';
    }

    return doctor.Room.floor !== null && doctor.Room.floor !== undefined
      ? `${doctor.Room.name} - Tầng ${doctor.Room.floor}`
      : doctor.Room.name;
  }

  getTimeRangeLabel(startTime: string | null | undefined, endTime: string | null | undefined): string {
    if (!startTime || !endTime) {
      return 'Cả ngày';
    }

    return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  }

  getBlockLabel(block: WorkScheduleBlock): string {
    return block.is_off ? 'Nghỉ cả ngày' : this.getTimeRangeLabel(block.start_time, block.end_time);
  }

  private getReceptionistBaseDoctors(): Doctor[] {
    return this.selectedDoctorId ? this.doctors.filter((doctor) => doctor.id === this.selectedDoctorId) : this.doctors;
  }

  private matchesReceptionistScheduleFilter(doctorId: number): boolean {
    const hasWorkingSchedule = this.getSchedulesForDoctorDate(doctorId).length > 0;
    const hasApprovedLeave = this.getApprovedBlocksForDoctorDate(doctorId).length > 0;

    switch (this.receptionistScheduleFilter) {
      case 'WORKING':
        return hasWorkingSchedule;
      case 'ON_LEAVE':
        return hasApprovedLeave;
      case 'WORKING_AND_LEAVE':
        return hasWorkingSchedule && hasApprovedLeave;
      case 'NO_WORKING':
        return !hasWorkingSchedule;
      default:
        return true;
    }
  }

  get selectedFormDoctor(): Doctor | null {
    const doctorId = Number(this.form.controls.doctor_id.value) || 0;
    return this.doctors.find((doctor) => doctor.id === doctorId) ?? null;
  }

  get selectedFormDayOfWeek(): WorkScheduleDayOfWeek {
    return Number(this.form.controls.day_of_week.value) as WorkScheduleDayOfWeek;
  }

  get availableStartTimeOptions(): string[] {
    const blockedIntervals = this.getBlockedIntervalsForSelectedFormDoctor();
    const options: string[] = [];

    for (
      let minutes = WorkSchedulesPageComponent.WORKDAY_START_MINUTES;
      minutes + WorkSchedulesPageComponent.TIME_SLOT_STEP_MINUTES <= WorkSchedulesPageComponent.WORKDAY_END_MINUTES;
      minutes += WorkSchedulesPageComponent.TIME_SLOT_STEP_MINUTES
    ) {
      const startTime = this.minutesToTime(minutes);
      if (this.getAvailableEndTimeOptionsForStart(minutes, blockedIntervals).length > 0) {
        options.push(startTime);
      }
    }

    return options;
  }

  get availableEndTimeOptions(): string[] {
    const startTime = this.timeToMinutes(this.form.controls.start_time.value);
    if (!Number.isFinite(startTime)) {
      return [];
    }

    return this.getAvailableEndTimeOptionsForStart(startTime, this.getBlockedIntervalsForSelectedFormDoctor());
  }

  get timeAvailabilityMessage(): string {
    if (!this.form.controls.doctor_id.value || !this.selectedFormDoctor) {
      return 'Hãy chọn bác sĩ để kiểm tra phòng làm việc.';
    }

    if (!this.selectedFormDoctor.room_id) {
      return 'Bác sĩ chưa được gán phòng, không thể kiểm tra trùng phòng.';
    }

    if (!this.form.controls.day_of_week.value && this.form.controls.day_of_week.value !== 0) {
      return 'Hãy chọn ngày trong tuần để kiểm tra khung giờ.';
    }

    if (!this.availableStartTimeOptions.length) {
      return 'Phòng này đã được bác sĩ khác sử dụng trong toàn bộ khung giờ làm việc của ngày đã chọn.';
    }

    return 'Chỉ hiển thị các khung giờ còn trống theo phòng của bác sĩ đã chọn.';
  }

  get hasAvailableTimeOptions(): boolean {
    return this.availableStartTimeOptions.length > 0;
  }

  private loadList(): void {
    this.isLoadingList = true;
    this.feedbackMessage = '';

    this.workSchedulesApiService.getAll().subscribe({
      next: (response) => {
        this.schedules = response.data;
        this.ensureDayPageValid();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách lịch làm việc.');
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
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải danh sách bác sĩ.');
      },
      complete: () => {
        this.isLoadingDoctors = false;
      }
    });
  }

  private loadApprovedScheduleBlocks(): void {
    this.isLoadingApprovedBlocks = true;

    this.workScheduleBlocksApiService.getAll().subscribe({
      next: (response) => {
        this.approvedScheduleBlocks = response.data.filter((block) => block.status === 'Approved');
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tải lịch nghỉ đã duyệt của bác sĩ.');
      },
      complete: () => {
        this.isLoadingApprovedBlocks = false;
      }
    });
  }

  private createSchedule(payload: WorkScheduleUpsertPayload): void {
    this.workSchedulesApiService.create(payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Tạo lịch làm việc thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();
        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể tạo lịch làm việc.');
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private updateSchedule(id: number, payload: WorkScheduleUpsertPayload): void {
    this.workSchedulesApiService.update(id, payload).subscribe({
      next: (response) => {
        this.showFeedback('success', response.message ?? 'Cập nhật lịch làm việc thành công.');
        this.isFormModalOpen = false;
        this.startCreateMode();
        this.updateBodyScrollState();

        if (this.selectedSchedule?.id === id) {
          this.selectedSchedule = response.data;
        }

        this.loadList();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showFeedback('error', error.error?.message ?? 'Không thể cập nhật lịch làm việc.');
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

    this.feedbackType = type;
    this.feedbackMessage = '';
  }

  private getFilteredSchedules(): WorkSchedule[] {
    const list = this.selectedDoctorId
      ? this.schedules.filter((schedule) => schedule.doctor_id === this.selectedDoctorId)
      : this.schedules;

    return [...list].sort((left, right) => {
      if (left.day_of_week !== right.day_of_week) {
        return left.day_of_week - right.day_of_week;
      }

      return left.start_time.localeCompare(right.start_time);
    });
  }

  private buildDoctorGroups(schedules: WorkSchedule[]): Array<{
    doctorId: number;
    doctorName: string;
    schedules: WorkSchedule[];
  }> {
    if (this.selectedDoctorId) {
      return [];
    }

    const groups = new Map<number, WorkSchedule[]>();

    for (const schedule of schedules) {
      const list = groups.get(schedule.doctor_id) ?? [];
      list.push(schedule);
      groups.set(schedule.doctor_id, list);
    }

    return Array.from(groups.entries())
      .map(([doctorId, doctorSchedules]) => {
        const sampleSchedule = doctorSchedules[0];
        return {
          doctorId,
          doctorName: sampleSchedule ? this.displayDoctorName(sampleSchedule) : `Bác sĩ #${doctorId}`,
          schedules: doctorSchedules
        };
      })
      .sort((left, right) => left.doctorName.localeCompare(right.doctorName));
  }

  private shiftSelectedDateByDays(dayOffset: number): void {
    const base = this.selectedDateObject;
    base.setDate(base.getDate() + dayOffset);
    this.selectedDate = this.toDateInputValue(base);
  }

  private get selectedDateObject(): Date {
    const parsed = new Date(this.selectedDate);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }

  private get selectedDayOfWeek(): WorkScheduleDayOfWeek {
    return this.selectedDateObject.getDay() as WorkScheduleDayOfWeek;
  }

  private get isSelectedDateToday(): boolean {
    return this.selectedDate === this.getTodayDateInputValue();
  }

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private getTodayDateInputValue(): string {
    return this.toDateInputValue(new Date());
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  private formatShortDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit'
    }).format(date);
  }

  private ensureDayPageValid(): void {
    const totalPages = Math.max(1, Math.ceil(this.daySchedules.length / this.dayPageSize));
    if (this.dayCurrentPage > totalPages) {
      this.dayCurrentPage = totalPages;
    }
  }

  private isValidTimeRange(startTime: string, endTime: string): boolean {
    const start = this.timeToSeconds(startTime);
    const end = this.timeToSeconds(endTime);
    return Number.isFinite(start) && Number.isFinite(end) && start < end && end - start >= 30 * 60;
  }

  private bindFormAvailabilityState(): void {
    this.form.controls.doctor_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.start_time.setValue('', { emitEvent: false });
        this.form.controls.end_time.setValue('', { emitEvent: false });
      });

    this.form.controls.day_of_week.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.start_time.setValue('', { emitEvent: false });
        this.form.controls.end_time.setValue('', { emitEvent: false });
      });

    this.form.controls.start_time.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const endTime = this.form.controls.end_time.value;
        if (endTime && !this.availableEndTimeOptions.includes(endTime)) {
          this.form.controls.end_time.setValue('', { emitEvent: false });
        }
      });
  }

  private getBlockedIntervalsForSelectedFormDoctor(): Array<{ start: number; end: number }> {
    const selectedDoctor = this.selectedFormDoctor;
    if (!selectedDoctor) {
      return [];
    }

    const selectedDay = this.selectedFormDayOfWeek;
    const doctorIdsInSameRoom = this.doctors
      .filter((doctor) => doctor.room_id !== null && doctor.room_id === selectedDoctor.room_id)
      .map((doctor) => doctor.id);

    const blockedDoctorIds = new Set<number>([selectedDoctor.id, ...doctorIdsInSameRoom]);

    return this.schedules
      .filter((schedule) => schedule.id !== this.editingScheduleId)
      .filter((schedule) => schedule.day_of_week === selectedDay)
      .filter((schedule) => blockedDoctorIds.has(schedule.doctor_id))
      .map((schedule) => ({
        start: this.timeToMinutes(schedule.start_time),
        end: this.timeToMinutes(schedule.end_time)
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));
  }

  private getAvailableEndTimeOptionsForStart(
    startMinutes: number,
    blockedIntervals: Array<{ start: number; end: number }>
  ): string[] {
    const options: string[] = [];

    for (
      let endMinutes = startMinutes + WorkSchedulesPageComponent.TIME_SLOT_STEP_MINUTES;
      endMinutes <= WorkSchedulesPageComponent.WORKDAY_END_MINUTES;
      endMinutes += WorkSchedulesPageComponent.TIME_SLOT_STEP_MINUTES
    ) {
      if (this.isIntervalAvailable(startMinutes, endMinutes, blockedIntervals)) {
        options.push(this.minutesToTime(endMinutes));
      }
    }

    return options;
  }

  private isIntervalAvailable(
    startMinutes: number,
    endMinutes: number,
    blockedIntervals: Array<{ start: number; end: number }>
  ): boolean {
    if (
      !Number.isFinite(startMinutes) ||
      !Number.isFinite(endMinutes) ||
      startMinutes < WorkSchedulesPageComponent.WORKDAY_START_MINUTES ||
      endMinutes > WorkSchedulesPageComponent.WORKDAY_END_MINUTES ||
      startMinutes >= endMinutes
    ) {
      return false;
    }

    return !blockedIntervals.some((interval) => startMinutes < interval.end && endMinutes > interval.start);
  }

  private timeToSeconds(value: string): number {
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
      return Number.NaN;
    }

    const [hours, minutes, seconds = 0] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  private timeToMinutes(value: string): number {
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
      return Number.NaN;
    }

    const [hours, minutes] = parts;
    return hours * 60 + minutes;
  }

  private minutesToTime(totalMinutes: number): string {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
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
}
