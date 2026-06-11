import { Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';

import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { getAppointmentStatusLabel } from '../../../shared/enum-label.util';
import { DoctorDashboardSummary } from '../../../shared/types/dashboard.type';

@Component({
  selector: 'app-doctor-portal-page',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './doctor-portal-page.component.html',
  styleUrl: './doctor-portal-page.component.scss',
})
export class DoctorPortalPageComponent {
  private readonly dashboardApiService = inject(DashboardApiService);

  protected summary: DoctorDashboardSummary | null = null;
  protected loading = true;
  protected errorMessage = '';

  constructor() {
    this.loadSummary();
  }

  protected loadSummary(): void {
    this.loading = true;
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
