import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { BackendRole } from '../../../core/models/auth-role.model';
import { NotificationService } from '../../../core/services/notification.service';
import { RealtimeEvent, RealtimeService } from '../../../core/services/realtime.service';
import { TokenService } from '../../../core/services/token.service';
import { AppointmentsApiService } from '../../appointments/data-access/appointments.api';
import { Appointment, AppointmentStatus } from '../../appointments/models/appointments.model';
import { Queue, QueuePriorityLevel, QueueStatus } from '../models/queues.model';
import { QueuesApiService } from '../services/queues.api';

type QueueStatusFilter = QueueStatus | 'ALL';
type QueueWorkflowStatus = QueueStatus | 'CheckedIn' | 'InProgress' | '-';
type QueueWorkflowFilter = QueueWorkflowStatus | 'ALL';
type QueueStatusSummaryItem = {
  key: QueueWorkflowFilter;
  label: string;
  total: number;
};
type NoShowModalState = {
  isOpen: boolean;
  appointmentId: number | null;
  title: string;
  patientName: string;
  description: string;
  note: string;
};

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
  private static readonly REALTIME_RELOAD_DEBOUNCE_MS = 400;

  private readonly queuesApiService = inject(QueuesApiService);
  private readonly appointmentsApiService = inject(AppointmentsApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly subscriptions = new Subscription();
  private alertTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;
  private realtimeReloadTimeoutId: ReturnType<typeof setTimeout> | null = null;

  queues: Queue[] = [];
  appointments: Appointment[] = [];
  isLoading = false;
  private pendingRequests = 0;
  processingAppointmentId: Record<number, boolean> = {};
  checkInPriorityByAppointmentId: Record<number, QueuePriorityLevel> = {};
  selectedPatientQueue: Queue | null = null;
  selectedPatientAppointment: Appointment | null = null;
  selectedDate = this.getTodayDateString();
  selectedDoctorId = 0;
  selectedStatus: QueueStatusFilter = 'ALL';
  selectedWorkflowStatus: QueueWorkflowFilter = 'ALL';
  activeTab: 'waiting' | 'queue' = 'waiting';
  currentTimestamp = Date.now();
  noShowModal: NoShowModalState = this.getDefaultNoShowModal();
  @Input() embedded = false;

  readonly currentRole: BackendRole | null = this.tokenService.getCurrentRole();
  readonly priorityOptions: Array<{ value: QueuePriorityLevel; label: string }> = [
    { value: 'Normal', label: 'Bình thường' },
    { value: 'Priority', label: 'Ưu tiên' },
    { value: 'Emergency', label: 'Khẩn cấp' },
  ];
  private readonly queuePriorityRank: Record<QueuePriorityLevel, number> = {
    Emergency: 0,
    Priority: 1,
    Normal: 2,
  };

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.selectedDate = params.get('date') || this.getTodayDateString();
        this.selectedDoctorId = this.parsePositiveQueryParam(params.get('doctor_id'));
        this.selectedStatus = this.parseAppointmentStatusParam(params.get('status'));
        this.selectedWorkflowStatus = this.parseWorkflowStatusParam(params.get('workflow'));
        this.activeTab = this.isDoctorView ? 'queue' : params.get('tab') === 'queue' ? 'queue' : 'waiting';
        this.loadData();
      })
    );

    this.subscriptions.add(
      this.realtimeService.events$.subscribe((event) => {
        if (this.shouldReloadFromRealtimeEvent(event)) {
          this.scheduleRealtimeReload();
        }
      })
    );
    this.realtimeService.connect();
    this.startPolling();
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearAlertTimeout();
    this.clearRealtimeReload();
    this.stopPolling();
    this.stopCountdown();
  }

  get isDoctorView(): boolean {
    return this.currentRole === 'DOCTOR';
  }

  get canUseCheckInAction(): boolean {
    return this.canAny(['RECEPTIONIST']);
  }

  get canUseCancelCheckInAction(): boolean {
    return false;
  }

  get canUseCancelAfterCheckInAction(): boolean {
    return false;
  }

  get canUseWaitingNoShowAction(): boolean {
    return this.canAny(['RECEPTIONIST']);
  }

  get canUseQueueNoShowAction(): boolean {
    return this.canAny(['DOCTOR']);
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
    return this.queues
      .filter((queue) => {
        const matchDate = !this.selectedDate || queue.date === this.selectedDate;
        const matchDoctor = this.isDoctorView || this.selectedDoctorId === 0 || queue.doctor_id === this.selectedDoctorId;
        const matchStatus = this.selectedStatus === 'ALL' || queue.Appointment?.status === this.selectedStatus;
        const matchWorkflowStatus =
          this.selectedWorkflowStatus === 'ALL' || this.getWorkflowStatus(queue) === this.selectedWorkflowStatus;
        return matchDate && matchDoctor && matchStatus && matchWorkflowStatus;
      })
      .sort((left, right) => this.compareQueuesForDisplay(left, right));
  }

  get currentInProgressQueue(): Queue | null {
    return this.queues
      .filter((queue) => this.matchesQueueScopeForServiceOrder(queue))
      .filter((queue) => this.getWorkflowStatus(queue) === 'InProgress')
      .sort((left, right) => this.compareDateLike(left.actual_start, right.actual_start))[0] ?? null;
  }

  get waitingServiceQueues(): Queue[] {
    return this.queues
      .filter((queue) => this.matchesQueueScopeForServiceOrder(queue))
      .filter((queue) => this.getWorkflowStatus(queue) === 'CheckedIn' && !queue.actual_start && !queue.actual_end)
      .sort((left, right) => this.compareWaitingQueues(left, right));
  }

  get nextStartableQueue(): Queue | null {
    if (this.currentInProgressQueue) {
      return null;
    }

    return this.waitingServiceQueues[0] ?? null;
  }

  get statusSummaryItems(): QueueStatusSummaryItem[] {
    const source = this.queues.filter((queue) => {
      const matchDate = !this.selectedDate || queue.date === this.selectedDate;
      const matchDoctor = this.isDoctorView || this.selectedDoctorId === 0 || queue.doctor_id === this.selectedDoctorId;
      return matchDate && matchDoctor;
    });

    const countByWorkflow = (status: QueueWorkflowStatus) =>
      source.filter((queue) => this.getWorkflowStatus(queue) === status).length;

    return [
      { key: 'ALL', label: 'Tất cả', total: source.length },
      { key: 'CheckedIn', label: 'Chờ khám', total: countByWorkflow('CheckedIn') },
      { key: 'InProgress', label: 'Đang khám', total: countByWorkflow('InProgress') },
      { key: 'Completed', label: 'Đã hoàn tất', total: countByWorkflow('Completed') },
      { key: 'NoShow', label: 'Vắng mặt', total: countByWorkflow('NoShow') },
    ];
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
    this.updateQueryParams(true);
  }

  updateSelectedDoctor(value: string): void {
    const parsed = Number(value);
    this.selectedDoctorId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    this.updateQueryParams(true);
  }

  updateSelectedStatus(value: string): void {
    if (value === 'Pending' || value === 'Confirmed' || value === 'CheckedIn' || value === 'Cancelled' || value === 'Completed' || value === 'NoShow') {
      this.selectedStatus = value;
    } else {
      this.selectedStatus = 'ALL';
    }

    this.updateQueryParams(true);
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
    } else {
      this.selectedWorkflowStatus = 'ALL';
    }

    this.updateQueryParams(true);
  }

  resetFilters(): void {
    this.selectedDate = this.getTodayDateString();
    this.selectedDoctorId = 0;
    this.selectedStatus = this.getDefaultStatusFilter();
    this.selectedWorkflowStatus = 'ALL';
    this.updateQueryParams(true);
  }

  reload(): void {
    this.loadData();
  }

  setActiveTab(tab: 'waiting' | 'queue'): void {
    if (this.isDoctorView && tab === 'waiting') {
      this.activeTab = 'queue';
      this.updateQueryParams(true);
      return;
    }

    this.activeTab = tab;
    this.updateQueryParams(true);
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
        return 'Đã đặt lịch';
      case 'CheckedIn':
        return 'Chờ khám';
      case 'Cancelled':
        return 'Đã hủy';
      case 'Completed':
        return 'Đã hoàn tất';
      case 'NoShow':
        return 'Vắng mặt';
      default:
        return status;
    }
  }

  getPriorityLabel(priority: QueuePriorityLevel | null | undefined): string {
    switch (priority) {
      case 'Emergency':
        return 'Khẩn cấp';
      case 'Priority':
        return 'Ưu tiên';
      default:
        return 'Bình thường';
    }
  }

  getAppointmentPriority(appointment: Appointment | null | undefined): QueuePriorityLevel {
    const priority = appointment?.priority_level;
    return priority === 'Emergency' || priority === 'Priority' || priority === 'Normal' ? priority : 'Normal';
  }

  getQueuePriority(queue: Queue): QueuePriorityLevel {
    const priority = queue.Appointment?.priority_level;
    return priority === 'Emergency' || priority === 'Priority' || priority === 'Normal' ? priority : 'Normal';
  }

  isNextStartableQueue(queue: Queue): boolean {
    return this.nextStartableQueue?.id === queue.id;
  }

  getServiceOrderLabel(queue: Queue): string {
    const workflowStatus = this.getWorkflowStatus(queue);
    if (workflowStatus === 'InProgress') {
      return 'Đang khám';
    }

    if (workflowStatus !== 'CheckedIn') {
      return this.getWorkflowStatusLabel(queue);
    }

    if (this.isNextStartableQueue(queue)) {
      return 'Tiếp theo';
    }

    const order = this.getWaitingServiceOrder(queue);
    return order > 0 ? `Lượt chờ #${order}` : 'Chờ khám';
  }

  getServiceOrderHint(queue: Queue): string {
    const workflowStatus = this.getWorkflowStatus(queue);
    if (workflowStatus === 'InProgress') {
      return 'Ca này đang được bác sĩ xử lý.';
    }

    if (workflowStatus !== 'CheckedIn') {
      return 'Lượt này không còn trong nhóm chờ khám.';
    }

    if (this.isNextStartableQueue(queue)) {
      return 'Đây là lượt được phép bắt đầu khám tiếp theo theo mức ưu tiên và thứ tự hàng đợi.';
    }

    return this.getStartDisabledReason(queue);
  }

  getCheckInPriority(appointment: Appointment): QueuePriorityLevel {
    return this.checkInPriorityByAppointmentId[appointment.id] || this.getAppointmentPriority(appointment);
  }

  updateCheckInPriority(appointment: Appointment, value: string): void {
    if (value === 'Normal' || value === 'Priority' || value === 'Emergency') {
      this.checkInPriorityByAppointmentId[appointment.id] = value;
      return;
    }

    this.checkInPriorityByAppointmentId[appointment.id] = 'Normal';
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

  openPatientDetail(queue: Queue): void {
    this.selectedPatientQueue = queue;
    this.selectedPatientAppointment = null;
  }

  openAppointmentPatientDetail(appointment: Appointment): void {
    this.selectedPatientAppointment = appointment;
    this.selectedPatientQueue = null;
  }

  closePatientDetail(): void {
    this.selectedPatientQueue = null;
    this.selectedPatientAppointment = null;
  }

  getSelectedPatientName(): string {
    return this.selectedPatientQueue
      ? this.getPatientName(this.selectedPatientQueue)
      : this.selectedPatientAppointment
        ? this.getPatientNameForAppointment(this.selectedPatientAppointment)
        : '-';
  }

  getSelectedPatientId(): number | null {
    return this.selectedPatientQueue?.Appointment?.patient?.id ?? this.selectedPatientAppointment?.patient?.id ?? null;
  }

  getSelectedPatientUsername(): string {
    return this.selectedPatientQueue?.Appointment?.patient?.username ?? this.selectedPatientAppointment?.patient?.username ?? '-';
  }

  getSelectedPatientAddress(): string {
    return this.selectedPatientQueue?.Appointment?.patient?.address
      ?? this.selectedPatientAppointment?.patient?.address
      ?? 'Chưa cập nhật';
  }

  getSelectedAppointmentDate(): string {
    return this.selectedPatientQueue?.date ?? this.selectedPatientAppointment?.date ?? '-';
  }

  getSelectedAppointmentTime(): string {
    return this.selectedPatientQueue?.Appointment?.time_slot?.slice(0, 5)
      ?? this.selectedPatientAppointment?.time_slot?.slice(0, 5)
      ?? '--:--';
  }

  getSelectedQueueNumberLabel(): string {
    return this.selectedPatientQueue?.queue_number ? 'Đã tiếp nhận' : 'Chưa tiếp nhận';
  }

  getSelectedAppointmentStatusLabel(): string {
    if (this.selectedPatientQueue) {
      return this.getWorkflowStatusLabel(this.selectedPatientQueue);
    }

    return this.selectedPatientAppointment
      ? this.getAppointmentStatusLabel(this.selectedPatientAppointment.status)
      : '-';
  }

  getSelectedPriorityLabel(): string {
    if (this.selectedPatientQueue) {
      return this.getPriorityLabel(this.getQueuePriority(this.selectedPatientQueue));
    }

    return this.getPriorityLabel(this.getAppointmentPriority(this.selectedPatientAppointment));
  }

  getSelectedAppointmentPredictedStartLabel(): string {
    if (this.selectedPatientQueue) {
      return this.getPredictedStartLabel(this.selectedPatientQueue);
    }

    return this.selectedPatientAppointment
      ? this.getQueueEstimateLabel(this.selectedPatientAppointment)
      : '--:--';
  }

  getSelectedCheckInLabel(): string {
    return this.selectedPatientQueue ? this.getTimeLabel(this.selectedPatientQueue.checked_in_at) : 'Chưa check-in';
  }

  getSelectedActualStartLabel(): string {
    return this.selectedPatientQueue ? this.getTimeLabel(this.selectedPatientQueue.actual_start) : '--:--';
  }

  getSelectedActualEndLabel(): string {
    return this.selectedPatientQueue ? this.getTimeLabel(this.selectedPatientQueue.actual_end) : '--:--';
  }

  getSelectedReason(): string {
    return this.selectedPatientQueue
      ? this.getReason(this.selectedPatientQueue)
      : this.selectedPatientAppointment?.reason || 'Không có ghi chú';
  }

  getSelectedNoShowNote(): string {
    return this.selectedPatientQueue?.Appointment?.no_show_note
      ?? this.selectedPatientAppointment?.no_show_note
      ?? 'Chưa có ghi chú vắng mặt';
  }

  getPatientGenderLabel(): string {
    const gender = this.selectedPatientQueue?.Appointment?.patient?.gender ?? this.selectedPatientAppointment?.patient?.gender;
    switch (gender) {
      case 'MALE':
        return 'Nam';
      case 'FEMALE':
        return 'Nữ';
      case 'OTHER':
        return 'Khác';
      default:
        return 'Chưa cập nhật';
    }
  }

  getPatientBirthdayLabel(): string {
    const value = this.selectedPatientQueue?.Appointment?.patient?.date_of_birth ?? this.selectedPatientAppointment?.patient?.date_of_birth;
    if (!value) {
      return 'Chưa cập nhật';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(parsed);
  }

  getPatientPhoneLabel(): string {
    const queuePatient = this.selectedPatientQueue?.Appointment?.patient;
    const appointmentPatient = this.selectedPatientAppointment?.patient;
    return queuePatient?.phone || appointmentPatient?.phone || 'Chưa cập nhật';
  }

  getPatientEmailLabel(): string {
    const queuePatient = this.selectedPatientQueue?.Appointment?.patient;
    const appointmentPatient = this.selectedPatientAppointment?.patient;
    return queuePatient?.email || appointmentPatient?.email || 'Chưa cập nhật';
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
        return 'Chờ khám';
      case 'InProgress':
        return 'Đang khám';
      case 'Completed':
        return 'Đã hoàn tất';
      case 'Cancelled':
        return 'Đã hủy';
      case 'NoShow':
        return 'Vắng mặt';
      case 'Confirmed':
        return 'Đã đặt lịch';
      case 'Pending':
        return 'Chờ xác nhận';
      default:
        return '-';
    }
  }

  canStart(queue: Queue): boolean {
    return (
      this.canUseStartAction &&
      queue.Appointment?.status === 'CheckedIn' &&
      !queue.actual_start &&
      this.isNextStartableQueue(queue)
    );
  }

  getStartDisabledReason(queue: Queue): string {
    if (!this.canUseStartAction) {
      return '';
    }

    if (queue.Appointment?.status !== 'CheckedIn') {
      return 'Chỉ có thể bắt đầu lượt đang ở trạng thái chờ khám.';
    }

    if (queue.actual_start) {
      return 'Lượt khám này đã được bắt đầu.';
    }

    const inProgressQueue = this.currentInProgressQueue;
    if (inProgressQueue && inProgressQueue.id !== queue.id) {
      return `Chưa thể bắt đầu vì đang có bệnh nhân khác trong phòng khám.`;
    }

    const nextQueue = this.nextStartableQueue;
    if (nextQueue && nextQueue.id !== queue.id) {
      return `Chưa tới lượt. Bệnh nhân được ưu tiên tiếp theo được xác định theo mức ưu tiên và giờ hẹn/check-in.`;
    }

    return '';
  }

  getWaitingServiceOrder(queue: Queue): number {
    const index = this.waitingServiceQueues.findIndex((item) => item.id === queue.id);
    return index >= 0 ? index + 1 : 0;
  }

  canComplete(queue: Queue): boolean {
    return this.canUseCompleteAction && queue.Appointment?.status === 'CheckedIn' && !!queue.actual_start && !queue.actual_end;
  }

  canCancelCheckIn(queue: Queue): boolean {
    return this.canUseCancelCheckInAction && !queue.actual_start && !queue.actual_end;
  }

  canCancelAfterCheckIn(queue: Queue): boolean {
    return (
      this.canUseCancelAfterCheckInAction &&
      queue.Appointment?.status === 'CheckedIn' &&
      !!queue.Appointment?.id &&
      !queue.actual_start &&
      !queue.actual_end
    );
  }

  canMarkWaitingNoShow(appointment: Appointment): boolean {
    return (
      this.canUseWaitingNoShowAction &&
      appointment.status === 'Confirmed' &&
      appointment.date === this.getTodayDateString() &&
      !appointment.Queue?.id
    );
  }

  canMarkQueueNoShow(queue: Queue): boolean {
    return (
      this.canUseQueueNoShowAction &&
      queue.Appointment?.status === 'CheckedIn' &&
      !!queue.Appointment?.id &&
      !queue.actual_start &&
      !queue.actual_end
    );
  }

  getPredictedWaitLabel(queue: Queue): string {
    const workflowStatus = this.getWorkflowStatus(queue);
    if (workflowStatus === 'Completed') {
      return 'Đã hoàn tất';
    }

    if (workflowStatus === 'InProgress') {
      return 'Đang khám';
    }

    if (workflowStatus === 'NoShow') {
      return 'Vắng mặt';
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

    this.appointmentsApiService.checkIn(appointment.id, this.getCheckInPriority(appointment)).subscribe({
      next: () => {
        this.showSuccess('Check-in thành công');
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

  markWaitingNoShow(appointment: Appointment): void {
    this.openNoShowModal({
      appointmentId: appointment.id,
      title: 'Ghi nhận vắng mặt',
      patientName: this.getPatientNameForAppointment(appointment),
      description: 'Ghi chú lý do bệnh nhân không có mặt tại khu vực tiếp nhận.',
      note: appointment.no_show_note || 'Bệnh nhân không có mặt khi gọi tiếp nhận.'
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

  cancelAfterCheckIn(queue: Queue): void {
    const appointmentId = queue.Appointment?.id;
    if (!appointmentId) {
      return;
    }

    if (!confirm('Hủy lượt khám đã check-in này?')) {
      return;
    }

    this.processingAppointmentId[appointmentId] = true;
    this.clearMessages();

    this.appointmentsApiService.cancel(appointmentId).subscribe({
      next: () => {
        this.showSuccess('Đã hủy lượt khám');
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể hủy lượt khám');
      },
      complete: () => {
        this.processingAppointmentId[appointmentId] = false;
      }
    });
  }

  markQueueNoShow(queue: Queue): void {
    const appointmentId = queue.Appointment?.id;
    if (!appointmentId) {
      return;
    }

    this.openNoShowModal({
      appointmentId,
      title: 'Ghi nhận vắng mặt',
      patientName: this.getPatientName(queue),
      description: 'Ghi chú lý do bệnh nhân không vào phòng khám khi đến lượt.',
      note: queue.Appointment?.no_show_note || 'Bệnh nhân không vào phòng khám khi đến lượt.'
    });
  }

  closeNoShowModal(): void {
    if (this.isSubmittingNoShow) {
      return;
    }

    this.noShowModal = this.getDefaultNoShowModal();
  }

  submitNoShowModal(): void {
    const appointmentId = this.noShowModal.appointmentId;
    if (!appointmentId) {
      return;
    }

    const note = this.noShowModal.note.trim();
    if (!note) {
      this.showError('Vui lòng nhập ghi chú vắng mặt.');
      return;
    }

    this.processingAppointmentId[appointmentId] = true;
    this.clearMessages();

    this.appointmentsApiService.markNoShow(appointmentId, note).subscribe({
      next: () => {
        this.showSuccess('Ghi nhận vắng mặt thành công');
        this.noShowModal = this.getDefaultNoShowModal();
        this.loadData(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể ghi nhận vắng mặt');
      },
      complete: () => {
        this.processingAppointmentId[appointmentId] = false;
      }
    });
  }

  get isSubmittingNoShow(): boolean {
    const appointmentId = this.noShowModal.appointmentId;
    return appointmentId ? Boolean(this.processingAppointmentId[appointmentId]) : false;
  }

  private openNoShowModal(state: Omit<NoShowModalState, 'isOpen'>): void {
    this.noShowModal = {
      ...state,
      isOpen: true
    };
  }

  private getDefaultNoShowModal(): NoShowModalState {
    return {
      isOpen: false,
      appointmentId: null,
      title: '',
      patientName: '',
      description: '',
      note: ''
    };
  }

  private loadData(preserveSuccessMessage = false): void {
    this.pendingRequests = this.isDoctorView ? 1 : 2;
    this.isLoading = true;
    this.loadQueues();

    if (this.isDoctorView) {
      this.appointments = [];
      return;
    }

    this.loadAppointments();
  }

  private shouldReloadFromRealtimeEvent(event: RealtimeEvent): boolean {
    if (event.type !== 'queue.updated' && event.type !== 'queue.forecast.updated') {
      return false;
    }

    const eventDate = event.payload.date;
    if (eventDate && this.selectedDate && eventDate !== this.selectedDate) {
      return false;
    }

    const eventDoctorId = Number(event.payload.doctor_id);
    if (!this.isDoctorView && this.selectedDoctorId > 0 && eventDoctorId !== this.selectedDoctorId) {
      return false;
    }

    return true;
  }

  private loadQueues(): void {
    this.queuesApiService.getAll(this.queueRequestFilters).subscribe({
      next: (response) => {
        this.queues = response.data;
        if (this.selectedPatientQueue) {
          this.selectedPatientQueue =
            this.queues.find((queue) => queue.id === this.selectedPatientQueue?.id) ?? null;
        }
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
    this.appointmentsApiService.getAll({
      doctor_id: !this.isDoctorView && this.selectedDoctorId > 0 ? this.selectedDoctorId : undefined,
      status: 'Confirmed',
      date_from: this.selectedDate,
      date_to: this.selectedDate
    }).subscribe({
      next: (response) => {
        this.appointments = response.data.filter((appointment) => appointment.status === 'Confirmed' && !appointment.Queue?.id);
        if (this.selectedPatientAppointment) {
          this.selectedPatientAppointment =
            this.appointments.find((appointment) => appointment.id === this.selectedPatientAppointment?.id) ?? null;
        }
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
    this.notificationService.success(message);
  }

  private showError(message: string): void {
    this.notificationService.error(message);
  }

  private clearMessages(): void {
    this.clearAlertTimeout();
  }

  private scheduleAlertHide(): void {
    this.clearAlertTimeout();
    this.alertTimeoutId = setTimeout(() => {
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

  private scheduleRealtimeReload(): void {
    this.clearRealtimeReload();
    this.realtimeReloadTimeoutId = setTimeout(() => {
      this.realtimeReloadTimeoutId = null;
      this.loadData(true);
    }, QueuesPageComponent.REALTIME_RELOAD_DEBOUNCE_MS);
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private clearRealtimeReload(): void {
    if (this.realtimeReloadTimeoutId) {
      clearTimeout(this.realtimeReloadTimeoutId);
      this.realtimeReloadTimeoutId = null;
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

  private updateQueryParams(replaceUrl = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        date: this.selectedDate || null,
        doctor_id: this.selectedDoctorId > 0 ? this.selectedDoctorId : null,
        status: this.selectedStatus !== 'ALL' ? this.selectedStatus : null,
        workflow: this.selectedWorkflowStatus !== 'ALL' ? this.selectedWorkflowStatus : null,
        tab: this.activeTab !== 'waiting' ? this.activeTab : null
      },
      replaceUrl
    });
  }

  private parsePositiveQueryParam(value: string | null): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  private parseAppointmentStatusParam(value: string | null): QueueStatusFilter {
    if (value === 'Pending' || value === 'Confirmed' || value === 'CheckedIn' || value === 'Cancelled' || value === 'Completed' || value === 'NoShow') {
      return value;
    }

    return this.getDefaultStatusFilter();
  }

  private getDefaultStatusFilter(): QueueStatusFilter {
    return 'ALL';
  }

  private parseWorkflowStatusParam(value: string | null): QueueWorkflowFilter {
    if (
      value === 'Pending' ||
      value === 'Confirmed' ||
      value === 'CheckedIn' ||
      value === 'Cancelled' ||
      value === 'Completed' ||
      value === 'NoShow' ||
      value === 'InProgress'
    ) {
      return value;
    }

    return 'ALL';
  }

  private matchesQueueScopeForServiceOrder(queue: Queue): boolean {
    const matchDate = !this.selectedDate || queue.date === this.selectedDate;
    const matchDoctor = this.isDoctorView || this.selectedDoctorId === 0 || queue.doctor_id === this.selectedDoctorId;
    return matchDate && matchDoctor;
  }

  private compareQueuesForDisplay(left: Queue, right: Queue): number {
    const leftRank = this.getDisplayCategoryRank(left);
    const rightRank = this.getDisplayCategoryRank(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (this.getWorkflowStatus(left) === 'CheckedIn' && this.getWorkflowStatus(right) === 'CheckedIn') {
      return this.compareWaitingQueues(left, right);
    }

    return (
      this.compareDateLike(left.actual_start, right.actual_start) ||
      this.compareDateLike(left.actual_end, right.actual_end) ||
      this.compareByQueueNumber(left, right)
    );
  }

  private compareWaitingQueues(left: Queue, right: Queue): number {
    const priorityDelta = this.queuePriorityRank[this.getQueuePriority(left)] - this.queuePriorityRank[this.getQueuePriority(right)];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return (
      this.compareDateLike(this.getQueueServicePriorityValue(left), this.getQueueServicePriorityValue(right)) ||
      this.compareDateLike(left.checked_in_at, right.checked_in_at) ||
      this.compareByQueueNumber(left, right)
    );
  }

  private getDisplayCategoryRank(queue: Queue): number {
    const workflowStatus = this.getWorkflowStatus(queue);
    if (workflowStatus === 'InProgress') {
      return 0;
    }

    if (workflowStatus === 'CheckedIn') {
      return 1;
    }

    if (workflowStatus === 'Completed') {
      return 2;
    }

    return 3;
  }

  private getQueueServicePriorityValue(queue: Queue): string | null {
    const timeSlot = queue.Appointment?.time_slot;
    if (queue.date && timeSlot) {
      return `${queue.date}T${String(timeSlot).slice(0, 8)}`;
    }

    return this.getQueuePredictedStart(queue) ?? queue.checked_in_at ?? null;
  }

  private compareDateLike(leftValue: string | null | undefined, rightValue: string | null | undefined): number {
    const leftTime = this.toDateLikeTimestamp(leftValue);
    const rightTime = this.toDateLikeTimestamp(rightValue);

    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    if (leftTime !== null || rightTime !== null) {
      return leftTime !== null ? -1 : 1;
    }

    return 0;
  }

  private compareByQueueNumber(left: Queue, right: Queue): number {
    const leftQueueNumber = Number.isInteger(left.queue_number) ? left.queue_number : Number.MAX_SAFE_INTEGER;
    const rightQueueNumber = Number.isInteger(right.queue_number) ? right.queue_number : Number.MAX_SAFE_INTEGER;
    if (leftQueueNumber !== rightQueueNumber) {
      return leftQueueNumber - rightQueueNumber;
    }

    return left.id - right.id;
  }

  private toDateLikeTimestamp(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
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
