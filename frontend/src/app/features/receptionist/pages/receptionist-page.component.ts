import { Component, OnDestroy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { RealtimeService } from '../../../core/services/realtime.service';
import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { getAppointmentStatusLabel } from '../../../shared/enum-label.util';
import { DashboardQueueItem, ReceptionistDashboardSummary } from '../../../shared/types/dashboard.type';

@Component({
  selector: 'app-receptionist-page',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './receptionist-page.component.html',
  styleUrl: './receptionist-page.component.scss',
})
export class ReceptionistPageComponent implements OnDestroy {
  private readonly dashboardApiService = inject(DashboardApiService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly realtimeSubscription: Subscription;

  protected summary: ReceptionistDashboardSummary | null = null;
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
        if (data.role !== 'RECEPTIONIST') {
          this.errorMessage = 'Dữ liệu trả về không đúng với vai trò lễ tân.';
          this.summary = null;
          this.loading = false;
          return;
        }

        this.summary = data;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải dữ liệu trang chủ lễ tân.';
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

  protected getQueueEstimatedStartLabel(queue: DashboardQueueItem): string {
    return queue.estimated_start ? this.formatDateTime(queue.estimated_start) : '--';
  }

  protected getQueueWaitLabel(queue: DashboardQueueItem): string {
    const remainingWaitMinutes = queue.remaining_wait_minutes ?? queue.predicted_wait_minutes;

    if (remainingWaitMinutes === null || remainingWaitMinutes === undefined) {
      return 'Chưa có dự báo';
    }

    return `Còn khoảng ${remainingWaitMinutes} phút`;
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
    if (normalizedKey.includes('queue') || normalizedKey.includes('waiting')) {
      return 'queue';
    }
    if (normalizedKey.includes('check')) {
      return 'how_to_reg';
    }
    if (normalizedKey.includes('appointment')) {
      return 'event_available';
    }
    return 'support_agent';
  }

  protected readonly getAppointmentStatusLabel = getAppointmentStatusLabel;
}
