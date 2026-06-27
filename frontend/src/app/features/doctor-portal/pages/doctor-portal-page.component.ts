import { Component, OnDestroy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { RealtimeService } from '../../../core/services/realtime.service';
import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { getAppointmentStatusLabel } from '../../../shared/enum-label.util';
import { DashboardQueueItem, DoctorDashboardSummary } from '../../../shared/types/dashboard.type';

interface DoctorUpcomingPatientItem {
  key: string;
  patient_name: string;
  status: string;
  queue_number: number | null;
  primary_time_label: string;
  primary_time_value: string;
  secondary_line: string;
  badge_status: string;
  sort_timestamp: number;
}

@Component({
  selector: 'app-doctor-portal-page',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './doctor-portal-page.component.html',
  styleUrl: './doctor-portal-page.component.scss',
})
export class DoctorPortalPageComponent implements OnDestroy {
  private readonly dashboardApiService = inject(DashboardApiService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly realtimeSubscription: Subscription;

  protected summary: DoctorDashboardSummary | null = null;
  protected loading = true;
  protected errorMessage = '';

  constructor() {
    this.loadSummary();
    this.realtimeService.connect();
    this.realtimeSubscription = this.realtimeService.events$.subscribe((event) => {
      if (event.type === 'queue.updated' || event.type === 'queue.forecast.updated') {
        this.loadSummary(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.realtimeSubscription.unsubscribe();
  }

  protected loadSummary(showLoading = true): void {
    if (showLoading) {
      this.loading = true;
    }
    this.errorMessage = '';

    this.dashboardApiService.getSummary().subscribe({
      next: ({ data }) => {
        if (data.role !== 'DOCTOR') {
          this.errorMessage = 'Dữ liệu trả về không đúng với vai trò bác sĩ.';
          this.summary = null;
          this.loading = false;
          return;
        }

        this.summary = data;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải dữ liệu trang chủ bác sĩ.';
        this.summary = null;
        this.loading = false;
      },
    });
  }

  protected formatTime(value: string | null | undefined): string {
    if (!value) {
      return '--';
    }

    return value.slice(0, 5);
  }

  protected formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '--';
    }

    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(value));
  }

  protected getUpcomingPatients(summary: DoctorDashboardSummary): DoctorUpcomingPatientItem[] {
    return summary.active_queues.map((queue) => this.mapQueueToUpcomingPatient(queue)).sort(
      (left, right) => left.sort_timestamp - right.sort_timestamp || left.patient_name.localeCompare(right.patient_name),
    );
  }

  private mapQueueToUpcomingPatient(queue: DashboardQueueItem): DoctorUpcomingPatientItem {
    const timeValue = queue.actual_start
        ? this.formatDateTime(queue.actual_start)
        : queue.estimated_start
          ? this.formatDateTime(queue.estimated_start)
          : '--';
    const timeLabel = queue.actual_start
        ? 'Bắt đầu khám'
        : 'Dự kiến khám';

    return {
      key: `queue-${queue.id}`,
      patient_name: queue.patient_name,
      status: this.getQueueStatusLabel(queue),
      queue_number: queue.queue_number,
      primary_time_label: timeLabel,
      primary_time_value: timeValue,
      secondary_line: this.getQueueSecondaryLine(queue),
      badge_status: 'CheckedIn',
      sort_timestamp: this.getQueueSortTimestamp(queue),
    };
  }

  private getQueueSortTimestamp(queue: DashboardQueueItem): number {
    const timestamp = new Date(
      queue.actual_start || queue.estimated_start || queue.checked_in_at || '',
    ).getTime();
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
  }

  private getQueueStatusLabel(queue: DashboardQueueItem): string {
    if (queue.actual_start) {
      return 'Đang khám';
    }

    return 'CheckedIn';
  }

  private getQueueSecondaryLine(queue: DashboardQueueItem): string {
    if (queue.actual_start) {
      return `Đang khám · ${this.formatDateTime(queue.actual_start)}`;
    }

    const remainingWaitMinutes = queue.remaining_wait_minutes ?? queue.predicted_wait_minutes;
    const waitLabel =
      remainingWaitMinutes !== null && remainingWaitMinutes !== undefined
        ? ` · còn khoảng ${remainingWaitMinutes} phút`
        : '';
    return `Đã check-in ${this.formatDateTime(queue.checked_in_at)}${waitLabel}`;
  }

  protected getAppointmentStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Pending':
        return 'status-badge--pending';
      case 'Confirmed':
        return 'status-badge--confirmed';
      case 'CheckedIn':
        return 'status-badge--checked-in';
      case 'Completed':
        return 'status-badge--completed';
      case 'Cancelled':
        return 'status-badge--cancelled';
      case 'NoShow':
        return 'status-badge--inactive';
      default:
        return '';
    }
  }

  protected getUpcomingStatusLabel(item: DoctorUpcomingPatientItem): string {
    if (item.status === 'Đang khám') {
      return item.status;
    }

    return getAppointmentStatusLabel(item.badge_status);
  }

  protected getKpiIcon(key: string): string {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes('queue') || normalizedKey.includes('wait')) {
      return 'personal_injury';
    }
    if (normalizedKey.includes('complete')) {
      return 'task_alt';
    }
    if (normalizedKey.includes('appointment') || normalizedKey.includes('patient')) {
      return 'clinical_notes';
    }
    return 'medical_services';
  }

  protected readonly getAppointmentStatusLabel = getAppointmentStatusLabel;
}
