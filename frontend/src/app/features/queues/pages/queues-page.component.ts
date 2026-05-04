import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BackendRole } from '../../../core/models/auth-role.model';
import { TokenService } from '../../../core/services/token.service';
import { AppointmentsApiService } from '../../appointments/data-access/appointments.api';
import { Appointment, AppointmentStatus } from '../../appointments/models/appointments.model';
import { Queue, QueueStatus } from '../models/queues.model';
import { QueuesApiService } from '../services/queues.api';

type QueueStatusFilter = QueueStatus | 'ALL';
type QueueWorkflowStatus = QueueStatus | 'CheckedIn' | 'InProgress' | '-';
type QueueWorkflowFilter = QueueWorkflowStatus | 'ALL';

@Component({
  selector: 'app-queues-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './queues-page.component.html',
  styleUrl: './queues-page.component.scss'
})
export class QueuesPageComponent implements OnInit, OnDestroy {
  private static readonly ALERT_AUTO_HIDE_MS = 5000;
  private static readonly POLL_INTERVAL_MS = 10000;
  private static readonly COUNTDOWN_INTERVAL_MS = 1000;

  private readonly queuesApiService = inject(QueuesApiService);
  private readonly appointmentsApiService = inject(AppointmentsApiService);
  private readonly tokenService = inject(TokenService);
  private alertTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;

  queues: Queue[] = [];
  appointments: Appointment[] = [];
  isLoading = false;
  private pendingRequests = 0;
  errorMessage = '';
  successMessage = '';
  processingAppointmentId: Record<number, boolean> = {};
  selectedDate = this.getTodayDateString();
  selectedDoctorId = 0;
  selectedStatus: QueueStatusFilter = 'ALL';
  selectedWorkflowStatus: QueueWorkflowFilter = 'ALL';
  activeTab: 'waiting' | 'queue' = 'waiting';
  currentTimestamp = Date.now();

  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();

  ngOnInit(): void {
    this.loadData();
    this.startPolling();
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearAlertTimeout();
    this.stopPolling();
    this.stopCountdown();
  }

  get isDoctorView(): boolean {
    return this.currentRole === 'DOCTOR';
  }

  get canUseCheckInAction(): boolean {
    return this.canAny(['ADMIN', 'RECEPTIONIST']);
  }

  get canUseCancelCheckInAction(): boolean {
    return this.canAny(['ADMIN', 'RECEPTIONIST']);
  }

  get canUseStartAction(): boolean {
    return this.canAny(['DOCTOR']);
  }

  get canUseCompleteAction(): boolean {
    return this.canAny(['DOCTOR']);
  }

  get queueRequestFilters(): { date?: string; doctor_id?: number; status?: string } {
    return {
      date: this.selectedDate || undefined,
      doctor_id: !this.isDoctorView && this.selectedDoctorId > 0 ? this.selectedDoctorId : undefined,
      status: this.selectedStatus === 'ALL' ? undefined : this.selectedStatus
    };
  }

  get filteredQueues(): Queue[] {
    return this.queues.filter((queue) => {
      const matchDate = !this.selectedDate || queue.date === this.selectedDate;
      const matchDoctor = this.isDoctorView || this.selectedDoctorId === 0 || queue.doctor_id === this.selectedDoctorId;
      const matchStatus = this.selectedStatus === 'ALL' || queue.Appointment?.status === this.selectedStatus;
      const matchWorkflowStatus =
        this.selectedWorkflowStatus === 'ALL' || this.getWorkflowStatus(queue) === this.selectedWorkflowStatus;
      return matchDate && matchDoctor && matchStatus && matchWorkflowStatus;
    });
  }

  get pendingCheckInAppointments(): Appointment[] {
    return this.appointments
      .filter((appointment) => {
        const matchDate = !this.selectedDate || appointment.date === this.selectedDate;
        const matchDoctor = this.isDoctorView || this.selectedDoctorId === 0 || appointment.doctor_id === this.selectedDoctorId;
        return matchDate && matchDoctor;
      })
      .sort((left, right) => {
        const leftTime = left.time_slot ?? '23:59:59';
        const rightTime = right.time_slot ?? '23:59:59';
        return `${left.date} ${leftTime}`.localeCompare(`${right.date} ${rightTime}`);
      });
  }

  get doctorFilterOptions(): Array<{ id: number; label: string }> {
    const map = new Map<number, string>();

    for (const queue of this.queues) {
      if (!map.has(queue.doctor_id)) {
        map.set(queue.doctor_id, this.getDoctorName(queue));
      }
    }

    for (const appointment of this.appointments) {
      if (!map.has(appointment.doctor_id)) {
        map.set(appointment.doctor_id, this.getDoctorNameForAppointment(appointment));
      }
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }

  updateSelectedDate(value: string): void {
    this.selectedDate = value || this.getTodayDateString();
    this.loadData();
  }

  updateSelectedDoctor(value: string): void {
    const parsed = Number(value);
    this.selectedDoctorId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    this.loadData();
  }

  updateSelectedStatus(value: string): void {
    if (value === 'Pending' || value === 'Confirmed' || value === 'CheckedIn' || value === 'Cancelled' || value === 'Completed' || value === 'NoShow') {
      this.selectedStatus = value;
    } else {
      this.selectedStatus = 'ALL';
    }

    this.loadData();
  }

  updateSelectedWorkflowStatus(value: string): void {
    if (
      value === 'Pending' ||
      value === 'Confirmed' ||
      value === 'CheckedIn' ||
      value === 'Cancelled' ||
      value === 'Completed' ||
      value === 'NoShow' ||
      value === 'InProgress'
    ) {
      this.selectedWorkflowStatus = value;
      return;
    }

    this.selectedWorkflowStatus = 'ALL';
  }

  resetFilters(): void {
    this.selectedDate = this.getTodayDateString();
    this.selectedDoctorId = 0;
    this.selectedStatus = 'ALL';
    this.selectedWorkflowStatus = 'ALL';
    this.loadData();
  }

  reload(): void {
    this.loadData();
  }

  setActiveTab(tab: 'waiting' | 'queue'): void {
    this.activeTab = tab;
  }

  getDoctorNameForAppointment(appointment: Appointment): string {
    return appointment.Doctor?.User?.fullname ?? appointment.Doctor?.User?.username ?? '-';
  }

  getPatientNameForAppointment(appointment: Appointment): string {
    return appointment.patient?.fullname ?? appointment.patient?.username ?? '-';
  }

  getAppointmentStatusLabel(status: AppointmentStatus): string {
    switch (status) {
      case 'Pending':
        return 'Chờ xác nhận';
      case 'Confirmed':
        return 'Đã xác nhận';
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

  getQueueEstimateLabel(appointment: Appointment): string {
    const value = this.getAppointmentPredictedStart(appointment);
    return this.getTimeLabel(value);
  }

  getDoctorName(queue: Queue): string {
    return queue.Appointment?.Doctor?.User?.fullname ?? queue.Appointment?.Doctor?.User?.username ?? '-';
  }

  getPatientName(queue: Queue): string {
    return queue.Appointment?.patient?.fullname ?? queue.Appointment?.patient?.username ?? '-';
  }

  getSpecialtyName(queue: Queue): string {
    return queue.Appointment?.Doctor?.Specialty?.name ?? '-';
  }

  getRoomLabel(queue: Queue): string {
    const room = queue.Appointment?.Doctor?.Room;
    if (!room?.name) {
      return '-';
    }

    return room.floor ? `${room.name} · Tầng ${room.floor}` : room.name;
  }

  getReason(queue: Queue): string {
    return queue.Appointment?.reason ?? 'Không có ghi chú';
  }

  getStatus(queue: Queue): QueueStatus | '-' {
    return queue.Appointment?.status ?? '-';
  }

  getWorkflowStatus(queue: Queue): QueueWorkflowStatus {
    const status = queue.Appointment?.status;

    if (status === 'Cancelled' || status === 'Completed' || status === 'NoShow') {
      return status;
    }

    if (queue.actual_end) {
      return 'Completed';
    }

    if (queue.actual_start) {
      return 'InProgress';
    }

    if (status === 'CheckedIn') {
      return 'CheckedIn';
    }

    return status ?? '-';
  }

  getWorkflowStatusLabel(queue: Queue): string {
    const workflowStatus = this.getWorkflowStatus(queue);

    switch (workflowStatus) {
      case 'CheckedIn':
        return 'Đã check-in';
      case 'InProgress':
        return 'Đang khám';
      case 'Completed':
        return 'Đã hoàn tất';
      case 'Cancelled':
        return 'Đã hủy';
      case 'NoShow':
        return 'Lỡ hẹn';
      case 'Confirmed':
        return 'Đã xác nhận';
      case 'Pending':
        return 'Chờ xác nhận';
      default:
        return '-';
    }
  }

  canStart(queue: Queue): boolean {
    return this.canUseStartAction && queue.Appointment?.status === 'CheckedIn' && !queue.actual_start;
  }

  canComplete(queue: Queue): boolean {
    return this.canUseCompleteAction && queue.Appointment?.status === 'CheckedIn' && !!queue.actual_start && !queue.actual_end;
  }

  canCancelCheckIn(queue: Queue): boolean {
    return this.canUseCancelCheckInAction && !queue.actual_start && !queue.actual_end;
  }

  getPredictedWaitLabel(queue: Queue): string {
    const workflowStatus = this.getWorkflowStatus(queue);
    if (workflowStatus === 'Completed') {
      return 'Đã hoàn tất';
    }

    if (workflowStatus === 'InProgress') {
      return 'Đang khám';
    }

    const predictedStart = this.getQueuePredictedStart(queue);
    const countdownLabel = this.getCountdownLabel(predictedStart);
    if (countdownLabel) {
      return countdownLabel;
    }

    const minutes = queue.predicted_wait_minutes ?? queue.WaitPrediction?.predicted_wait_time ?? null;
    if (typeof minutes !== 'number' || minutes < 0) {
      return 'Chưa có';
    }

    if (minutes === 0) {
      return 'Đang tới lượt';
    }

    return `${minutes} phút`;
  }

  getPredictedStartLabel(queue: Queue): string {
    return this.getTimeLabel(this.getQueuePredictedStart(queue));
  }

  getTimeLabel(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value).slice(11, 16) || '--:--';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(parsed);
  }

  canCheckIn(appointment: Appointment): boolean {
    return (
      appointment.status === 'Confirmed' &&
      appointment.date === this.getTodayDateString() &&
      !appointment.Queue?.id &&
      this.canUseCheckInAction
    );
  }

  checkIn(appointment: Appointment): void {
    this.processingAppointmentId[appointment.id] = true;
    this.clearMessages();

    this.appointmentsApiService.checkIn(appointment.id).subscribe({
      next: () => {
        this.showSuccess('Check-in và cấp số thứ tự thành công');
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể check-in lịch hẹn');
      },
      complete: () => {
        this.processingAppointmentId[appointment.id] = false;
      }
    });
  }

  start(queue: Queue): void {
    const appointmentId = queue.Appointment?.id;
    if (!appointmentId) {
      return;
    }

    this.processingAppointmentId[appointmentId] = true;
    this.clearMessages();

    this.appointmentsApiService.start(appointmentId).subscribe({
      next: () => {
        this.showSuccess('Đã bắt đầu lượt khám');
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể bắt đầu lượt khám');
      },
      complete: () => {
        this.processingAppointmentId[appointmentId] = false;
      }
    });
  }

  complete(queue: Queue): void {
    const appointmentId = queue.Appointment?.id;
    if (!appointmentId) {
      return;
    }

    this.processingAppointmentId[appointmentId] = true;
    this.clearMessages();

    this.appointmentsApiService.complete(appointmentId).subscribe({
      next: () => {
        this.showSuccess('Đã hoàn tất lượt khám');
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể hoàn tất lượt khám');
      },
      complete: () => {
        this.processingAppointmentId[appointmentId] = false;
      }
    });
  }

  cancelCheckIn(queue: Queue): void {
    this.processingAppointmentId[queue.Appointment?.id ?? 0] = true;
    this.clearMessages();

    this.queuesApiService.delete(queue.id).subscribe({
      next: () => {
        this.showSuccess('Hủy check-in thành công');
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể hủy check-in');
      },
      complete: () => {
        this.processingAppointmentId[queue.Appointment?.id ?? 0] = false;
      }
    });
  }

  private loadData(preserveSuccessMessage = false): void {
    this.pendingRequests = 2;
    this.isLoading = true;
    this.errorMessage = '';
    if (!preserveSuccessMessage) {
      this.successMessage = '';
    }

    this.loadQueues();
    this.loadAppointments();
  }

  private loadQueues(): void {
    this.queuesApiService.getAll(this.queueRequestFilters).subscribe({
      next: (response) => {
        this.queues = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể tải danh sách hàng đợi');
      },
      complete: () => {
        this.finishLoadingRequest();
      }
    });
  }

  private loadAppointments(): void {
    this.appointmentsApiService.getAll().subscribe({
      next: (response) => {
        this.appointments = response.data.filter((appointment) => appointment.status === 'Confirmed' && !appointment.Queue?.id);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể tải danh sách lịch chờ check-in');
      },
      complete: () => {
        this.finishLoadingRequest();
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

  private canAny(roles: BackendRole[]): boolean {
    if (!this.currentRole) {
      return false;
    }

    return roles.includes(this.currentRole);
  }

  private finishLoadingRequest(): void {
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    this.isLoading = this.pendingRequests > 0;
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
    }, QueuesPageComponent.ALERT_AUTO_HIDE_MS);
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
      this.loadData(true);
    }, QueuesPageComponent.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.currentTimestamp = Date.now();
    this.countdownIntervalId = setInterval(() => {
      this.currentTimestamp = Date.now();
    }, QueuesPageComponent.COUNTDOWN_INTERVAL_MS);
  }

  private stopCountdown(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  private getAppointmentPredictedStart(appointment: Appointment): string | null {
    const queue = appointment.Queue;
    if (!queue) {
      return appointment.estimated_start ?? null;
    }

    return queue.estimated_start
      ?? appointment.estimated_start
      ?? this.getDerivedPredictedStart(queue.checked_in_at ?? null, queue.predicted_wait_minutes ?? null)
      ?? null;
  }

  private getQueuePredictedStart(queue: Queue): string | null {
    return queue.estimated_start
      ?? queue.WaitPrediction?.predicted_start
      ?? this.getDerivedPredictedStart(
        queue.checked_in_at ?? null,
        queue.predicted_wait_minutes ?? queue.WaitPrediction?.predicted_wait_time ?? null
      )
      ?? null;
  }

  private getCountdownLabel(predictedStart: string | null): string | null {
    if (!predictedStart) {
      return null;
    }

    const parsed = new Date(predictedStart);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const remainingMs = parsed.getTime() - this.currentTimestamp;
    if (remainingMs <= 0) {
      return 'Đang tới lượt';
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours} giờ ${minutes} phút`;
    }

    if (minutes > 0) {
      return `${minutes} phút`;
    }

    return 'Dưới 1 phút';
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
}
