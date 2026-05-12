import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { QueuesPageComponent } from '../../queues/pages/queues-page.component';
import { AppointmentsApiService } from '../data-access/appointments.api';
import { Appointment, AppointmentStatus } from '../models/appointments.model';

type DoctorVisitStatusFilter = 'CheckedIn' | 'InProgress' | 'Completed' | 'NoShow';
type AppointmentStatusFilter = AppointmentStatus | DoctorVisitStatusFilter | 'ALL';

@Component({
  selector: 'app-appointments-page',
  standalone: true,
  imports: [CommonModule, FormsModule, QueuesPageComponent],
  templateUrl: './appointments-management-page.component.html',
  styleUrls: ['./appointments-page.component.scss']
})
export class AppointmentsPageComponent implements OnInit, OnDestroy {
  private static readonly ALERT_AUTO_HIDE_MS = 5000;
  private static readonly POLL_INTERVAL_MS = 10000;

  private readonly appointmentsApiService = inject(AppointmentsApiService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptions = new Subscription();
  private alertTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;

  appointments: Appointment[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  processingActionById: Record<number, boolean> = {};
  selectedDate = this.getTodayDateString();
  selectedDoctorId = 0;
  selectedStatus: AppointmentStatusFilter = 'ALL';
  viewMode: 'day' | 'week' = 'day';
  activeDoctorDayTab: 'schedule' | 'in-progress' | 'completed' = 'schedule';

  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.selectedDate = params.get('date') || this.getTodayDateString();
        this.selectedDoctorId = this.parsePositiveQueryParam(params.get('doctor_id'));
        this.selectedStatus = this.parseStatusParam(
          this.isDoctorView ? params.get('workflow') : params.get('status')
        );
        this.viewMode = params.get('view') === 'week' ? 'week' : 'day';
        this.activeDoctorDayTab = this.parseDoctorDayTab(params.get('tab'));
        this.loadAppointments();
      })
    );

    this.startPolling();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearAlertTimeout();
    this.stopPolling();
  }

  reload(): void {
    this.loadAppointments();
  }

  resetFilters(): void {
    this.selectedDate = this.getTodayDateString();
    this.selectedDoctorId = 0;
    this.selectedStatus = this.getDefaultStatusFilter();
    this.updateQueryParams(true);
  }

  updateSelectedDate(value: string): void {
    this.selectedDate = value || this.getTodayDateString();
    this.updateQueryParams(true);
  }

  updateSelectedDoctor(value: string): void {
    const parsed = Number(value);
    this.selectedDoctorId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    this.updateQueryParams(true);
  }

  updateSelectedStatus(value: string): void {
    if (
      value === 'Confirmed' ||
      value === 'CheckedIn' ||
      value === 'Cancelled' ||
      value === 'Completed' ||
      value === 'NoShow' ||
      value === 'InProgress'
    ) {
      this.selectedStatus = value;
    } else {
      this.selectedStatus = 'ALL';
    }

    this.updateQueryParams(true);
  }

  setViewMode(mode: 'day' | 'week'): void {
    this.viewMode = mode;
    this.updateQueryParams(true);
  }

  setDoctorDayTab(tab: 'schedule' | 'in-progress' | 'completed'): void {
    this.activeDoctorDayTab = tab;
    this.updateQueryParams(true);
  }

  goToPreviousWeek(): void {
    this.shiftSelectedDateByDays(-7);
    this.viewMode = 'week';
    this.updateQueryParams(true);
  }

  goToNextWeek(): void {
    this.shiftSelectedDateByDays(7);
    this.viewMode = 'week';
    this.updateQueryParams(true);
  }

  goToToday(): void {
    this.selectedDate = this.getTodayDateString();
    this.updateQueryParams(true);
  }

  get filteredAppointments(): Appointment[] {
    return this.filteredByDoctorAndStatusAppointments.filter((appointment) => appointment.date === this.selectedDate);
  }

  get filteredByDoctorAndStatusAppointments(): Appointment[] {
    return this.appointments.filter((appointment) => {
      const matchDoctor = this.selectedDoctorId === 0 || appointment.doctor_id === this.selectedDoctorId;
      const matchStatus = this.selectedStatus === 'ALL' || appointment.status === this.selectedStatus;
      return matchDoctor && matchStatus;
    });
  }

  get weekDayAppointments(): Array<{ dateKey: string; dayLabel: string; dateLabel: string; appointments: Appointment[] }> {
    const weekStart = this.getWeekStart(this.selectedDateObject);
    const source = this.filteredByDoctorAndStatusAppointments;
    const result: Array<{ dateKey: string; dayLabel: string; dateLabel: string; appointments: Appointment[] }> = [];

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateKey = this.toDateInputValue(date);

      result.push({
        dateKey,
        dayLabel: this.dayLabel(date),
        dateLabel: this.formatDateLabel(date),
        appointments: source.filter((appointment) => appointment.date === dateKey)
      });
    }

    return result;
  }

  get hasAnyWeekAppointment(): boolean {
    return this.weekDayAppointments.some((item) => item.appointments.length > 0);
  }

  get weekAppointmentsCount(): number {
    return this.weekDayAppointments.reduce((total, day) => total + day.appointments.length, 0);
  }

  get doctorInProgressAppointments(): Appointment[] {
    return this.filteredAppointments.filter((appointment) => !!appointment.Queue?.actual_start && !appointment.Queue?.actual_end);
  }

  get doctorScheduleAppointments(): Appointment[] {
    return this.filteredAppointments.filter((appointment) => {
      if (appointment.status === 'Confirmed') {
        return true;
      }

      return appointment.status === 'CheckedIn' && !appointment.Queue?.actual_start && !appointment.Queue?.actual_end;
    });
  }

  get doctorCompletedAppointments(): Appointment[] {
    return this.filteredAppointments.filter((appointment) => !!appointment.Queue?.actual_end || appointment.status === 'Completed');
  }

  get doctorFilterOptions(): Array<{ id: number; label: string }> {
    const map = new Map<number, string>();

    for (const appointment of this.appointments) {
      if (map.has(appointment.doctor_id)) {
        continue;
      }

      map.set(appointment.doctor_id, this.getDoctorName(appointment));
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }

  get isDoctorView(): boolean {
    return this.currentRole === 'DOCTOR';
  }

  get isReceptionistView(): boolean {
    return this.currentRole === 'RECEPTIONIST';
  }

  get pageTitle(): string {
    if (this.isDoctorView) {
      return 'Danh sách lịch hẹn khám';
    }

    if (this.isReceptionistView) {
      return 'Quản lý hàng đợi';
    }

    return 'Quản lý lịch hẹn';
  }

  get pageSubtitle(): string {
    if (this.isDoctorView) {
      return 'Bác sĩ xem danh sách bệnh nhân đã check-in, theo dõi trạng thái lượt khám, thời gian chờ dự kiến và xử lý bắt đầu khám, kết thúc khám hoặc ghi nhận vắng mặt.';
    }

    if (this.isReceptionistView) {
      return 'Theo dõi lịch chờ tiếp nhận, check-in bệnh nhân, cấp số tiếp nhận và quản lý danh sách hàng đợi trong ngày.';
    }

    return 'Theo dõi trạng thái lịch hẹn và xử lý nhanh các bước tiếp nhận.';
  }

  get canUseCancelAction(): boolean {
    return this.canAny(['ADMIN', 'RECEPTIONIST']);
  }

  get canUseCheckInAction(): boolean {
    return this.canAny(['ADMIN', 'RECEPTIONIST']);
  }

  get canUseStartAction(): boolean {
    return this.canAny(['DOCTOR']);
  }

  get canUseCompleteAction(): boolean {
    return this.canAny(['DOCTOR']);
  }

  canCancel(appointment: Appointment): boolean {
    return (
      appointment.status === 'Confirmed' &&
      !appointment.Queue?.id &&
      this.canAny(['ADMIN', 'RECEPTIONIST'])
    );
  }

  canStart(appointment: Appointment): boolean {
    return appointment.status === 'CheckedIn' && !!appointment.Queue?.id && !appointment.Queue?.actual_start && this.canUseStartAction;
  }

  canComplete(appointment: Appointment): boolean {
    return appointment.status === 'CheckedIn' && !!appointment.Queue?.id && !!appointment.Queue?.actual_start && !appointment.Queue?.actual_end && this.canUseCompleteAction;
  }

  canCheckIn(appointment: Appointment): boolean {
    return (
      appointment.status === 'Confirmed' &&
      appointment.date === this.getTodayDateString() &&
      !appointment.Queue?.id &&
      this.canUseCheckInAction
    );
  }

  cancel(appointment: Appointment): void {
    this.executeAction(appointment.id, () => this.appointmentsApiService.cancel(appointment.id), 'Hủy lịch hẹn thành công');
  }

  checkIn(appointment: Appointment): void {
    this.executeAction(appointment.id, () => this.appointmentsApiService.checkIn(appointment.id), 'Check-in và cấp số thứ tự thành công');
  }

  start(appointment: Appointment): void {
    this.executeAction(appointment.id, () => this.appointmentsApiService.start(appointment.id), 'Đã bắt đầu lịch hẹn');
  }

  complete(appointment: Appointment): void {
    this.executeAction(appointment.id, () => this.appointmentsApiService.complete(appointment.id), 'Đã hoàn tất lịch hẹn');
  }

  getDoctorName(appointment: Appointment): string {
    return appointment.Doctor?.User?.fullname ?? appointment.Doctor?.User?.username ?? '-';
  }

  getDisplayTime(value: string | null): string {
    return typeof value === 'string' && value ? value.slice(0, 5) : 'Chưa sắp xếp';
  }

  getScheduledTimeLabel(appointment: Appointment): string {
    return this.getDisplayTime(appointment.time_slot);
  }

  getDoctorAppointmentTimeLabel(appointment: Appointment): string {
    if (appointment.time_slot) {
      return this.getDisplayTime(appointment.time_slot);
    }

    const estimatedStart = this.getPredictedStartValue(appointment);
    if (!estimatedStart) {
      return 'Chưa cập nhật';
    }

    const parsed = new Date(estimatedStart);
    if (Number.isNaN(parsed.getTime())) {
      return 'Chưa cập nhật';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(parsed);
  }

  getEstimatedStartLabel(appointment: Appointment): string {
    return this.getDateTimeClockLabel(this.getPredictedStartValue(appointment));
  }

  getActualStartLabel(appointment: Appointment): string {
    return this.getDateTimeClockLabel(appointment.Queue?.actual_start ?? null);
  }

  getActualEndLabel(appointment: Appointment): string {
    return this.getDateTimeClockLabel(appointment.Queue?.actual_end ?? null);
  }

  getQueueNumberLabel(appointment: Appointment): string {
    return appointment.Queue?.queue_number ? `Số tiếp nhận #${appointment.Queue.queue_number}` : 'Chưa cấp số tiếp nhận';
  }

  getStatusLabel(status: AppointmentStatus): string {
    switch (status) {
      case 'Confirmed':
        return 'Đã đặt lịch';
      case 'CheckedIn':
        return 'Đã check-in';
      case 'Cancelled':
        return 'Đã hủy';
      case 'Completed':
        return 'Đã hoàn tất';
      case 'NoShow':
        return 'Lỡ hẹn';
      default:
        return status;
    }
  }

  private shiftSelectedDateByDays(offset: number): void {
    const date = this.selectedDateObject;
    date.setDate(date.getDate() + offset);
    this.selectedDate = this.toDateInputValue(date);
  }

  private get selectedDateObject(): Date {
    const parsed = new Date(this.selectedDate);
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

  private dayLabel(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date);
  }

  private formatDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getPredictedStartValue(appointment: Appointment): string | null {
    const queue = appointment.Queue;
    if (!queue) {
      return appointment.estimated_start ?? null;
    }

    return queue.estimated_start
      ?? appointment.estimated_start
      ?? this.getDerivedPredictedStart(queue.checked_in_at ?? null, queue.predicted_wait_minutes ?? null)
      ?? null;
  }

  private getDerivedPredictedStart(
    checkedInAt: string | null | undefined,
    predictedWaitMinutes: number | null | undefined
  ): string | null {
    if (!checkedInAt || typeof predictedWaitMinutes !== 'number' || predictedWaitMinutes < 0) {
      return null;
    }

    const parsed = new Date(checkedInAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getTime() + predictedWaitMinutes * 60 * 1000).toISOString();
  }

  private getDateTimeClockLabel(value: string | null): string {
    if (!value) {
      return '--:--';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '--:--';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(parsed);
  }

  private canAny(roles: BackendRole[]): boolean {
    if (!this.currentRole) {
      return false;
    }

    return roles.includes(this.currentRole);
  }

  private loadAppointments(preserveSuccessMessage = false): void {
    if (this.isDoctorView) {
      this.appointments = [];
      this.isLoading = false;
      this.errorMessage = '';
      if (!preserveSuccessMessage) {
        this.successMessage = '';
      }
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    if (!preserveSuccessMessage) {
      this.successMessage = '';
    }

    const dateRange = this.getActiveDateRange();
    const appointmentStatus =
      this.selectedStatus === 'InProgress' ? 'ALL' : this.selectedStatus;

    this.appointmentsApiService.getAll({
      doctor_id: this.selectedDoctorId || undefined,
      status: appointmentStatus,
      date_from: dateRange.dateFrom,
      date_to: dateRange.dateTo
    }).subscribe({
      next: (response) => {
        this.appointments = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể tải danh sách lịch hẹn');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private executeAction(
    appointmentId: number,
    action: () => { subscribe: (observer: { next?: () => void; error?: (error: { error?: { message?: string } }) => void; complete?: () => void }) => void },
    successMessage: string
  ): void {
    this.processingActionById[appointmentId] = true;
    this.clearMessages();

    action().subscribe({
      next: () => {
        this.showSuccess(successMessage);
        this.loadAppointments(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể cập nhật lịch hẹn');
      },
      complete: () => {
        this.processingActionById[appointmentId] = false;
      }
    });
  }

  private getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getActiveDateRange(): { dateFrom: string; dateTo: string } {
    if (this.viewMode === 'week') {
      const weekStart = this.getWeekStart(this.selectedDateObject);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return {
        dateFrom: this.toDateInputValue(weekStart),
        dateTo: this.toDateInputValue(weekEnd)
      };
    }

    return {
      dateFrom: this.selectedDate,
      dateTo: this.selectedDate
    };
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    this.scheduleAlertHide();
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    this.scheduleAlertHide();
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.clearAlertTimeout();
  }

  private scheduleAlertHide(): void {
    this.clearAlertTimeout();
    this.alertTimeoutId = setTimeout(() => {
      this.errorMessage = '';
      this.successMessage = '';
      this.alertTimeoutId = null;
    }, AppointmentsPageComponent.ALERT_AUTO_HIDE_MS);
  }

  private clearAlertTimeout(): void {
    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
      this.alertTimeoutId = null;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollIntervalId = setInterval(() => {
      this.loadAppointments(true);
    }, AppointmentsPageComponent.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private updateQueryParams(replaceUrl = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        date: this.selectedDate || null,
        doctor_id: this.selectedDoctorId > 0 ? this.selectedDoctorId : null,
        status: !this.isDoctorView && this.selectedStatus !== 'ALL' ? this.selectedStatus : null,
        workflow: this.isDoctorView && this.selectedStatus !== 'ALL' ? this.selectedStatus : null,
        view: !this.isDoctorView && this.viewMode !== 'day' ? this.viewMode : null,
        tab: !this.isDoctorView && this.activeDoctorDayTab !== 'schedule' ? this.activeDoctorDayTab : null
      },
      replaceUrl
    });
  }

  private parsePositiveQueryParam(value: string | null): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  private parseStatusParam(value: string | null): AppointmentStatusFilter {
    if (
      value === 'Confirmed' ||
      value === 'CheckedIn' ||
      value === 'Cancelled' ||
      value === 'Completed' ||
      value === 'NoShow' ||
      value === 'InProgress'
    ) {
      return value;
    }

    return this.getDefaultStatusFilter();
  }

  private getDefaultStatusFilter(): AppointmentStatusFilter {
    return 'ALL';
  }

  private parseDoctorDayTab(value: string | null): 'schedule' | 'in-progress' | 'completed' {
    return value === 'in-progress' || value === 'completed' ? value : 'schedule';
  }
}
