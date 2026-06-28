import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Doctor, DoctorAvailabilityDay, DoctorAvailabilityPeriod } from '../../models/doctors.model';
import { DoctorsApiService } from '../../services/doctors.api';
import { getDoctorStatusLabel } from '../../../../shared/enum-label.util';

@Component({
  selector: 'app-doctor-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './doctor-detail-modal.component.html',
  styleUrl: './doctor-detail-modal.component.scss'
})
export class DoctorDetailModalComponent implements OnChanges {
  private static readonly PREVIEW_DAYS = 14;
  private readonly doctorsApiService = inject(DoctorsApiService);

  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isLoading = false;
  @Input() doctor: Doctor | null = null;

  @Output() closeModal = new EventEmitter<void>();

  availabilityDays: DoctorAvailabilityDay[] = [];
  isLoadingAvailability = false;
  availabilityErrorMessage = '';
  selectedStartDate = this.getTodayDateString();

  private readonly weekdayLabels = [
    'Chủ nhật',
    'Thứ hai',
    'Thứ ba',
    'Thứ tư',
    'Thứ năm',
    'Thứ sáu',
    'Thứ bảy'
  ];

  ngOnChanges(changes: SimpleChanges): void {
    const doctorChanged = Object.prototype.hasOwnProperty.call(changes, 'doctor');
    const openChanged = Object.prototype.hasOwnProperty.call(changes, 'isOpen');

    if (!this.isOpen) {
      return;
    }

    if ((doctorChanged || openChanged) && this.doctor?.id) {
      this.loadAvailability();
    }
  }

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  onStartDateChange(value: string): void {
    this.selectedStartDate = value || this.getTodayDateString();

    if (this.doctor?.id) {
      this.loadAvailability();
    }
  }

  reloadAvailability(): void {
    if (!this.doctor?.id) {
      return;
    }

    this.loadAvailability();
  }

  formatDayLabel(day: DoctorAvailabilityDay): string {
    return `${this.weekdayLabels[day.day_of_week] || 'Không rõ'} • ${this.formatDate(day.date)}`;
  }

  formatPeriod(period: DoctorAvailabilityPeriod): string {
    return `${period.start_time.slice(0, 5)} - ${period.end_time.slice(0, 5)}`;
  }

  getAvailabilityBadge(day: DoctorAvailabilityDay): string {
    if (day.is_off) {
      return 'Nghỉ cả ngày';
    }

    if (day.blocked_periods.length > 0) {
      return 'Có chặn lịch';
    }

    if (day.working_periods.length > 0) {
      return 'Đang làm việc';
    }

    return 'Không có lịch';
  }

  getDoctorStatusLabel(status: string | null | undefined): string {
    return getDoctorStatusLabel(status);
  }

  private loadAvailability(): void {
    if (!this.doctor?.id) {
      this.availabilityDays = [];
      return;
    }

    const startDate = this.selectedStartDate;
    const endDate = this.addDays(startDate, DoctorDetailModalComponent.PREVIEW_DAYS - 1);

    this.isLoadingAvailability = true;
    this.availabilityErrorMessage = '';

    this.doctorsApiService.getAvailability(this.doctor.id, startDate, endDate).subscribe({
      next: (response) => {
        this.availabilityDays = response.data.days;
      },
      error: (error: { error?: { message?: string } }) => {
        this.availabilityDays = [];
        this.availabilityErrorMessage =
          error.error?.message ?? 'Không thể tải lịch làm việc và lịch nghỉ của bác sĩ.';
      },
      complete: () => {
        this.isLoadingAvailability = false;
      }
    });
  }

  private getTodayDateString(): string {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  private addDays(dateValue: string, days: number): string {
    const baseDate = new Date(`${dateValue}T00:00:00`);
    baseDate.setDate(baseDate.getDate() + days);

    const timezoneOffset = baseDate.getTimezoneOffset() * 60 * 1000;
    return new Date(baseDate.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  private formatDate(dateValue: string): string {
    const [year, month, day] = dateValue.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(utcDate);
  }
}
