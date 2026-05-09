import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { getAppointmentStatusLabel } from '../../../shared/enum-label.util';
import { AdminDashboardSummary } from '../../../shared/types/dashboard.type';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  private readonly dashboardApiService = inject(DashboardApiService);

  protected summary: AdminDashboardSummary | null = null;
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
        if (data.role !== 'ADMIN') {
          this.errorMessage = 'Dữ liệu trả về không đúng với vai trò quản trị viên.';
          this.summary = null;
          this.loading = false;
          return;
        }

        this.summary = data;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Không thể tải dữ liệu tổng quan.';
        this.summary = null;
        this.loading = false;
      },
    });
  }

  protected readonly getAppointmentStatusLabel = getAppointmentStatusLabel;
}
