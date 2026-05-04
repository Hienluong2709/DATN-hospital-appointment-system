import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { DoctorsApiService } from '../../doctors/services/doctors.api';
import { Specialty } from '../../specialties/models/specialties.model';
import { SpecialtiesApiService } from '../../specialties/services/specialties.api';
import { NotificationModalComponent } from '../../../shared/components/notification-modal/notification-modal.component';
import { AppointmentsApiService } from '../data-access/appointments.api';
import {
  Appointment,
  AppointmentStatus,
  AvailableDoctorSlot,
  CreateAppointmentPayload
} from '../models/appointments.model';

type PatientAppointmentTab = 'upcoming' | 'waiting' | 'completed' | 'cancelled';
type PatientAppointmentTimeFilter = 'ALL' | 'THIS_MONTH';

@Component({
  selector: 'app-patient-appointments-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationModalComponent],
  templateUrl: './patient-appointments-page.component.html',
  styleUrls: ['./patient-appointments-page.component.scss']
})
export class PatientAppointmentsPageComponent implements OnInit, OnDestroy {
  private static readonly HIDDEN_ARCHIVED_APPOINTMENTS_STORAGE_KEY = 'patient-hidden-archived-appointments';
  private static readonly POLL_INTERVAL_MS = 15000;
  private readonly appointmentsApiService = inject(AppointmentsApiService);
  private readonly specialtiesApiService = inject(SpecialtiesApiService);
  private readonly doctorsApiService = inject(DoctorsApiService);
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;

  appointments: Appointment[] = [];
  specialties: Specialty[] = [];
  availableDoctors: AvailableDoctorSlot[] = [];

  isLoadingAppointments = false;
  isLoadingSpecialties = false;
  isLoadingAvailableDoctors = false;
  isValidatingBooking = false;
  isCreatingAppointment = false;

  processingActionById: Record<number, boolean> = {};
  isNotificationOpen = false;
  notificationMessage = '';
  notificationType: 'success' | 'error' = 'success';
  notificationVersion = 0;
  inlineErrorMessage = '';
  selectedAppointmentDetail: Appointment | null = null;
  hiddenArchivedAppointmentIds = new Set<number>();

  selectedSpecialtyId = 0;
  bookingDate = this.getMinimumBookingDateString();
  readonly minBookingDate = this.getMinimumBookingDateString();
  selectedDoctorId = 0;
  bookingReason = '';
  activeTab: PatientAppointmentTab = 'upcoming';
  searchTerm = '';
  selectedTimeFilter: PatientAppointmentTimeFilter = 'ALL';

  ngOnInit(): void {
    this.restoreHiddenArchivedAppointments();
    this.loadAppointments();
    this.loadSpecialties();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get selectedDoctor(): AvailableDoctorSlot | null {
    return this.availableDoctors.find((doctor) => doctor.doctor_id === this.selectedDoctorId) ?? null;
  }

  get activeAppointments(): Appointment[] {
    return this.appointments
      .filter((appointment) => this.isActiveAppointment(appointment))
      .sort((left, right) => this.toAppointmentTimestamp(left) - this.toAppointmentTimestamp(right));
  }

  get upcomingAppointments(): Appointment[] {
    const now = Date.now();
    return this.activeAppointments.filter(
      (appointment) => appointment.status !== 'CheckedIn' && this.toAppointmentTimestamp(appointment) >= now
    );
  }

  get waitingAppointments(): Appointment[] {
    return this.activeAppointments
      .filter((appointment) => appointment.status === 'CheckedIn' && this.isAppointmentToday(appointment))
      .sort((left, right) => this.toAppointmentTimestamp(left) - this.toAppointmentTimestamp(right));
  }

  get cancelledAppointments(): Appointment[] {
    return this.appointments
      .filter(
        (appointment) =>
          (appointment.status === 'Cancelled' ||
            appointment.status === 'NoShow' ||
            this.isMissedAppointment(appointment) ||
            this.isOverdueCheckedInAppointment(appointment)) &&
          !this.hiddenArchivedAppointmentIds.has(appointment.id)
      )
      .sort((left, right) => this.toAppointmentTimestamp(right) - this.toAppointmentTimestamp(left));
  }

  get completedAppointments(): Appointment[] {
    return this.appointments
      .filter((appointment) => appointment.status === 'Completed')
      .sort((left, right) => this.toAppointmentTimestamp(right) - this.toAppointmentTimestamp(left));
  }

  get nextAppointment(): Appointment | null {
    const candidates = this.appointments.filter((appointment) =>
      this.isEligibleForNextAppointment(appointment)
    );

    if (!candidates.length) {
      return null;
    }

    return candidates
      .slice()
      .sort((left, right) => this.toAppointmentTimestamp(left) - this.toAppointmentTimestamp(right))[0] ?? null;
  }

  get visibleUpcomingAppointments(): Appointment[] {
    return this.applyPatientFilters(this.upcomingAppointments);
  }

  get visibleCompletedAppointments(): Appointment[] {
    return this.applyPatientFilters(this.completedAppointments);
  }

  get visibleWaitingAppointments(): Appointment[] {
    return this.applyPatientFilters(this.waitingAppointments);
  }

  get visibleCancelledAppointments(): Appointment[] {
    return this.applyPatientFilters(this.cancelledAppointments);
  }

  get activeTabAppointments(): Appointment[] {
    switch (this.activeTab) {
      case 'waiting':
        return this.visibleWaitingAppointments;
      case 'completed':
        return this.visibleCompletedAppointments;
      case 'cancelled':
        return this.visibleCancelledAppointments;
      default:
        return this.visibleUpcomingAppointments;
    }
  }

  selectSpecialty(value: string): void {
    const parsed = Number(value);
    this.selectedSpecialtyId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    this.selectedDoctorId = 0;
    this.availableDoctors = [];

    if (this.selectedSpecialtyId > 0) {
      this.loadAvailableDoctorsByCriteria();
    }
  }

  selectBookingDate(value: string): void {
    this.bookingDate = value || this.minBookingDate;
    this.selectedDoctorId = 0;
    this.availableDoctors = [];

    if (this.selectedSpecialtyId > 0) {
      this.loadAvailableDoctorsByCriteria();
    }
  }

  selectDoctor(value: string): void {
    const parsed = Number(value);
    this.selectedDoctorId = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  updateReason(value: string): void {
    this.bookingReason = value;
  }

  setActiveTab(tab: PatientAppointmentTab): void {
    this.activeTab = tab;
  }

  updateSearchTerm(value: string): void {
    this.searchTerm = value;
  }

  updateTimeFilter(value: string): void {
    this.selectedTimeFilter = value === 'THIS_MONTH' ? 'THIS_MONTH' : 'ALL';
  }

  clearAppointmentFilters(): void {
    this.searchTerm = '';
    this.selectedTimeFilter = 'ALL';
  }

  openAppointmentDetail(appointment: Appointment): void {
    this.selectedAppointmentDetail = appointment;
  }

  closeAppointmentDetail(): void {
    this.selectedAppointmentDetail = null;
  }

  async submitBooking(): Promise<void> {
    if (this.isCreatingAppointment || this.isValidatingBooking) {
      return;
    }

    this.clearMessages();

    if (this.selectedSpecialtyId <= 0) {
      this.showError('Vui lòng chọn chuyên khoa.');
      return;
    }

    if (!this.bookingDate) {
      this.showError('Vui lòng chọn ngày khám.');
      return;
    }

    if (this.selectedDoctorId <= 0) {
      this.showError('Vui lòng chọn bác sĩ.');
      return;
    }

    if (!this.selectedDoctor) {
      this.showError('Bác sĩ đã chọn không còn khả dụng trong ngày này. Vui lòng chọn lại.');
      return;
    }

    this.isValidatingBooking = true;

    try {
      const latestAvailability = await this.refreshAvailableDoctorsByCriteria();
      const doctor = latestAvailability.find((item) => item.doctor_id === this.selectedDoctorId);

      if (!doctor) {
        this.showError('Bác sĩ đã hết lịch trống hoặc không còn phù hợp với ngày đã chọn.');
        this.selectedDoctorId = 0;
        return;
      }

      this.availableDoctors = latestAvailability;
    } catch (error) {
      this.showError(this.extractErrorMessage(error, 'Không thể kiểm tra lịch trống của bác sĩ.'));
      return;
    } finally {
      this.isValidatingBooking = false;
    }

    const payload: CreateAppointmentPayload = {
      doctor_id: this.selectedDoctorId,
      date: this.bookingDate,
      reason: this.bookingReason.trim() || null
    };

    this.isCreatingAppointment = true;

    this.appointmentsApiService.create(payload).subscribe({
      next: () => {
        this.showSuccess('Đặt lịch thành công, lịch hẹn của bạn đã được xác nhận.');
        this.selectedDoctorId = 0;
        this.bookingReason = '';
        this.loadAppointments();
        this.loadAvailableDoctorsByCriteria();
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể đặt lịch khám. Vui lòng thử lại.');
      },
      complete: () => {
        this.isCreatingAppointment = false;
      }
    });
  }

  cancel(appointment: Appointment): void {
    if (!this.canCancelAppointment(appointment)) {
      this.showError(
        appointment.Queue?.id
          ? 'Lịch hẹn đã check-in, vui lòng liên hệ lễ tân để hủy check-in.'
          : 'Chỉ được hủy lịch hẹn trước ít nhất 24 giờ.'
      );
      return;
    }

    this.executeAction(appointment.id, () => this.appointmentsApiService.cancel(appointment.id), 'Hủy lịch hẹn thành công');
  }

  hideArchivedAppointment(appointment: Appointment): void {
    if (!this.canHideArchivedAppointment(appointment)) {
      return;
    }

    this.hiddenArchivedAppointmentIds.add(appointment.id);
    this.persistHiddenArchivedAppointments();

    if (this.selectedAppointmentDetail?.id === appointment.id) {
      this.closeAppointmentDetail();
    }
  }

  getDoctorName(appointment: Appointment): string {
    return appointment.Doctor?.User?.fullname ?? appointment.Doctor?.User?.username ?? '-';
  }

  getDisplayTime(value: string | null): string {
    return typeof value === 'string' && value ? value.slice(0, 5) : 'Chưa sắp xếp';
  }

  getEstimatedStartLabel(appointment: Appointment): string {
    const value = this.getPredictedStartValue(appointment);
    if (!value) {
      return 'Chưa cập nhật';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Chưa cập nhật';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hour12: false
    }).format(parsed);
  }

  getStatusLabel(status: AppointmentStatus): string {
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

  getStatusClass(status: AppointmentStatus): string {
    switch (status) {
      case 'Pending':
        return 'status-chip--pending';
      case 'Confirmed':
        return 'status-chip--confirmed';
      case 'CheckedIn':
        return 'status-chip--checked-in';
      case 'Completed':
        return 'status-chip--completed';
      case 'Cancelled':
        return 'status-chip--cancelled';
      case 'NoShow':
        return 'status-chip--missed';
      default:
        return '';
    }
  }

  getSpecialtyName(appointment: Appointment): string {
    return appointment.Doctor?.Specialty?.name ?? 'Chuyên khoa đang cập nhật';
  }

  getAppointmentStatusLabel(appointment: Appointment): string {
    if (appointment.status === 'NoShow' || this.isMissedAppointment(appointment) || this.isOverdueCheckedInAppointment(appointment)) {
      return 'Lỡ hẹn';
    }

    if (appointment.status === 'CheckedIn' && appointment.Queue?.actual_start && !appointment.Queue?.actual_end) {
      return 'Đang khám';
    }

    if (appointment.status === 'CheckedIn') {
      return 'Đang chờ khám';
    }

    return this.getStatusLabel(appointment.status);
  }

  getAppointmentStatusClass(appointment: Appointment): string {
    if (appointment.status === 'NoShow' || this.isMissedAppointment(appointment) || this.isOverdueCheckedInAppointment(appointment)) {
      return 'status-chip--missed';
    }

    if (appointment.status === 'CheckedIn' && appointment.Queue?.actual_start && !appointment.Queue?.actual_end) {
      return 'status-chip--in-progress';
    }

    return this.getStatusClass(appointment.status);
  }

  canHideArchivedAppointment(appointment: Appointment): boolean {
    return (
      appointment.status === 'Cancelled' ||
      appointment.status === 'NoShow' ||
      this.isMissedAppointment(appointment) ||
      this.isOverdueCheckedInAppointment(appointment)
    );
  }

  getRoomLabel(appointment: Appointment): string {
    const room = appointment.Doctor?.Room;
    if (!room?.name) {
      return 'Phòng khám sẽ được cập nhật sau';
    }

    return room.floor ? `${room.name} · Tầng ${room.floor}` : room.name;
  }

  getAppointmentCode(appointment: Appointment): string {
    return `LH-${String(appointment.id).padStart(6, '0')}`;
  }

  getQueueNumberLabel(appointment: Appointment): string {
    return appointment.Queue?.queue_number ? `Số tiếp nhận #${appointment.Queue.queue_number}` : 'Chưa cấp số tiếp nhận';
  }

  getExpectedArrivalLabel(appointment: Appointment): string {
    const source = this.getPredictedStartValue(appointment);
    if (!source) {
      return 'Theo hướng dẫn của quầy tiếp nhận';
    }

    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) {
      return 'Theo hướng dẫn của quầy tiếp nhận';
    }

    const arrival = new Date(parsed.getTime() - 15 * 60 * 1000);
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hour12: false
    }).format(arrival);
  }

  getNextStepHint(appointment: Appointment): string {
    if (appointment.status === 'CheckedIn') {
      return 'Bạn đã check-in. Vui lòng ở gần phòng khám để theo dõi lượt gọi vào khám.';
    }

    if (appointment.status === 'Confirmed') {
      return 'Vui lòng có mặt trước giờ dự kiến 15 phút và mang theo CCCD/BHYT khi đến khám.';
    }

    if (appointment.status === 'Pending') {
      return 'Lịch hẹn đang chờ xử lý. Bạn có thể theo dõi cập nhật mới nhất ngay trên trang này.';
    }

    if (appointment.status === 'Completed') {
      return 'Bạn có thể xem lại thông tin lịch hẹn và liên hệ bệnh viện nếu cần tái khám.';
    }

    if (appointment.status === 'NoShow') {
      return 'Lịch khám này đã được ghi nhận là lỡ hẹn. Bạn có thể đặt lại lịch mới nếu vẫn cần thăm khám.';
    }

    return 'Nếu cần hỗ trợ thêm, vui lòng liên hệ quầy tiếp nhận của bệnh viện.';
  }

  getTabTitle(): string {
    switch (this.activeTab) {
      case 'waiting':
        return 'Đang chờ khám';
      case 'completed':
        return 'Đã hoàn thành';
      case 'cancelled':
        return 'Đã huỷ / lỡ hẹn';
      default:
        return 'Sắp khám';
    }
  }

  getEmptyStateMessage(): string {
    switch (this.activeTab) {
      case 'waiting':
        return 'Bạn chưa có lịch nào đang chờ khám.';
      case 'completed':
        return 'Chưa có lịch khám nào đã hoàn thành.';
      case 'cancelled':
        return 'Chưa có lịch khám nào đã huỷ hoặc lỡ hẹn.';
      default:
        return 'Bạn chưa có lịch khám sắp tới nào.';
    }
  }

  private loadAppointments(): void {
    this.isLoadingAppointments = true;

    this.appointmentsApiService.getAll().subscribe({
      next: (response) => {
        this.appointments = response.data;
      },
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message ?? 'Không thể tải danh sách lịch hẹn');
      },
      complete: () => {
        this.isLoadingAppointments = false;
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
        this.showError(error.error?.message ?? 'Không thể tải danh sách chuyên khoa');
      },
      complete: () => {
        this.isLoadingSpecialties = false;
      }
    });
  }

  private loadAvailableDoctorsByCriteria(): void {
    void this.refreshAvailableDoctorsByCriteria()
      .then((data) => {
        this.availableDoctors = data;
        if (!this.availableDoctors.some((doctor) => doctor.doctor_id === this.selectedDoctorId)) {
          const hadSelectedDoctor = this.selectedDoctorId > 0;
          this.selectedDoctorId = 0;
          if (hadSelectedDoctor) {
            this.showError('Bác sĩ đã chọn không còn nhận lịch trong thời điểm này. Vui lòng chọn lại.');
          }
        }

        if (this.selectedSpecialtyId > 0 && this.bookingDate && this.availableDoctors.length === 0) {
          this.showError('Không còn bác sĩ nhận lịch cho chuyên khoa và ngày đã chọn.');
        }
      })
      .catch((error: unknown) => {
        this.showError(this.extractErrorMessage(error, 'Không thể tải lịch trống của bác sĩ'));
      });
  }

  private async refreshAvailableDoctorsByCriteria(): Promise<AvailableDoctorSlot[]> {
    if (!this.selectedSpecialtyId || !this.bookingDate) {
      return [];
    }

    this.isLoadingAvailableDoctors = true;

    try {
      const response = await firstValueFrom(
        this.doctorsApiService.getBySpecialtyAndDate(this.selectedSpecialtyId, this.bookingDate)
      );

      return response.data;
    } catch (error) {
      this.availableDoctors = [];
      throw error;
    } finally {
      this.isLoadingAvailableDoctors = false;
    }
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
        this.loadAppointments();
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

  private getMinimumBookingDateString(): string {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    const year = nextDay.getFullYear();
    const month = String(nextDay.getMonth() + 1).padStart(2, '0');
    const day = String(nextDay.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isActiveAppointment(appointment: Appointment): boolean {
    return appointment.status !== 'Cancelled' && appointment.status !== 'Completed' && appointment.status !== 'NoShow';
  }

  private isEligibleForNextAppointment(appointment: Appointment): boolean {
    if (!this.isActiveAppointment(appointment)) {
      return false;
    }

    if (this.isMissedAppointment(appointment)) {
      return false;
    }

    if (this.isOverdueCheckedInAppointment(appointment)) {
      return false;
    }

    return true;
  }

  private isMissedAppointment(appointment: Appointment): boolean {
    if (!this.isActiveAppointment(appointment)) {
      return false;
    }

    if (appointment.status !== 'Pending' && appointment.status !== 'Confirmed') {
      return false;
    }

    return this.toAppointmentTimestamp(appointment) < Date.now();
  }

  private isOverdueCheckedInAppointment(appointment: Appointment): boolean {
    return appointment.status === 'CheckedIn' && !this.isAppointmentToday(appointment);
  }

  private isAppointmentToday(appointment: Appointment): boolean {
    return appointment.date === this.getTodayDateString();
  }

  canCancelAppointment(appointment: Appointment): boolean {
    if (appointment.status === 'Cancelled' || appointment.status === 'Completed' || !!appointment.Queue?.id) {
      return false;
    }

    return this.toAppointmentTimestamp(appointment) - Date.now() > 24 * 60 * 60 * 1000;
  }

  private applyPatientFilters(appointments: Appointment[]): Appointment[] {
    const searchTerm = this.searchTerm.trim().toLowerCase();

    return appointments.filter((appointment) => {
      const matchesSearch =
        !searchTerm ||
        this.getDoctorName(appointment).toLowerCase().includes(searchTerm) ||
        this.getSpecialtyName(appointment).toLowerCase().includes(searchTerm);

      const matchesTime =
        this.selectedTimeFilter === 'ALL' || this.isAppointmentInCurrentMonth(appointment);

      return matchesSearch && matchesTime;
    });
  }

  private isAppointmentInCurrentMonth(appointment: Appointment): boolean {
    const parsed = new Date(`${appointment.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const now = new Date();
    return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
  }

  private toAppointmentTimestamp(appointment: Appointment): number {
    const predictedStart = this.getPredictedStartValue(appointment);
    if (predictedStart) {
      const estimatedTimestamp = new Date(predictedStart).getTime();
      if (!Number.isNaN(estimatedTimestamp)) {
        return estimatedTimestamp;
      }
    }

    const timeValue = typeof appointment.time_slot === 'string' && appointment.time_slot ? appointment.time_slot.slice(0, 5) : '23:59';
    const parsed = new Date(`${appointment.date}T${timeValue}:00`);
    const timestamp = parsed.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private extractErrorMessage(error: unknown, fallbackMessage: string): string {
    if (typeof error === 'object' && error !== null) {
      const response = error as { error?: { message?: string } };
      return response.error?.message ?? fallbackMessage;
    }

    return fallbackMessage;
  }

  closeNotification(): void {
    this.isNotificationOpen = false;
    this.notificationMessage = '';
  }

  private clearMessages(): void {
    this.inlineErrorMessage = '';
    this.closeNotification();
  }

  private showSuccess(message: string): void {
    this.inlineErrorMessage = '';
    this.showNotification('success', message);
  }

  private showError(message: string): void {
    this.closeNotification();
    this.inlineErrorMessage = message;
  }

  private showNotification(type: 'success' | 'error', message: string): void {
    this.notificationType = type;
    this.notificationMessage = message;
    this.notificationVersion += 1;
    this.isNotificationOpen = true;
  }

  private restoreHiddenArchivedAppointments(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(PatientAppointmentsPageComponent.HIDDEN_ARCHIVED_APPOINTMENTS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      this.hiddenArchivedAppointmentIds = new Set(
        parsed
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      );
    } catch {
      this.hiddenArchivedAppointmentIds = new Set<number>();
    }
  }

  private persistHiddenArchivedAppointments(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      PatientAppointmentsPageComponent.HIDDEN_ARCHIVED_APPOINTMENTS_STORAGE_KEY,
      JSON.stringify(Array.from(this.hiddenArchivedAppointmentIds))
    );
  }

  private getPredictedStartValue(appointment: Appointment): string | null {
    const queue = appointment.Queue;
    if (!queue) {
      return appointment.estimated_start ?? null;
    }

    return this.getDerivedPredictedStart(queue.checked_in_at ?? null, queue.predicted_wait_minutes ?? null)
      ?? queue.estimated_start
      ?? appointment.estimated_start
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

  private startPolling(): void {
    this.stopPolling();
    this.pollIntervalId = setInterval(() => {
      this.loadAppointments();
    }, PatientAppointmentsPageComponent.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
}
