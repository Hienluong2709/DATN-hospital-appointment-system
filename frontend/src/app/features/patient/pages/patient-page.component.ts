import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TokenService } from '../../../core/services/token.service';
import { PortalTopbarComponent } from '../../../shared/components/portal-topbar/portal-topbar.component';
import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { PublicDashboardSnapshot } from '../../../shared/types/dashboard.type';

@Component({
  selector: 'app-patient-page',
  standalone: true,
  imports: [RouterLink, PortalTopbarComponent],
  templateUrl: './patient-page.component.html',
  styleUrl: './patient-page.component.scss',
})
export class PatientPageComponent {
  private readonly tokenService = inject(TokenService);
  private readonly dashboardApiService = inject(DashboardApiService);

  protected publicSnapshot: PublicDashboardSnapshot | null = null;
  protected publicErrorMessage = '';

  get isLoggedIn(): boolean {
    return this.tokenService.hasValidSession();
  }

  get accountLabel(): string {
    const currentUser = this.tokenService.getCurrentUser();
    const candidates = [
      currentUser?.['fullName'],
      currentUser?.['fullname'],
      currentUser?.['name'],
      currentUser?.['username'],
      currentUser?.['email'],
    ];

    const best = candidates.find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );

    return typeof best === 'string' && best.trim().length > 0
      ? best.trim()
      : 'bệnh nhân';
  }

  bookingSteps = [
    {
      step: '01',
      title: 'Xem thông tin công khai',
      description:
        'Tìm hiểu chuyên khoa, bác sĩ và các lưu ý trước khi khám ngay trên trang bệnh viện.',
    },
    {
      step: '02',
      title: 'Đăng nhập hoặc tạo tài khoản',
      description:
        'Bệnh nhân chỉ cần đăng nhập khi bắt đầu đặt lịch hoặc muốn theo dõi lịch hẹn trực tuyến.',
    },
    {
      step: '03',
      title: 'Đặt lịch và theo dõi lịch hẹn',
      description:
        'Chọn chuyên khoa, ngày khám và bác sĩ còn nhận lịch, sau đó quản lý lịch khám trong cổng bệnh nhân.',
    },
  ];

  featuredBenefits = [
    {
      title: 'Không gian khám thân thiện',
      description:
        'Khu tiếp đón và phòng khám sắp xếp thông thoáng, hướng dẫn rõ từng bước cho bệnh nhân.',
    },
    {
      title: 'Minh bạch chi phí',
      description:
        'Bảng giá dịch vụ được cập nhật công khai, có tư vấn chi tiết trước khi thực hiện.',
    },
    {
      title: 'Theo dõi liên tục',
      description:
        'Bệnh án điện tử và lịch sử tái khám giúp theo sát tiến trình hồi phục của bạn.',
    },
  ];

  constructor() {
    this.loadPublicSnapshot();
  }

  get trustIndicators() {
    return this.publicSnapshot?.stats ?? [];
  }

  get doctors() {
    return this.publicSnapshot?.featured_doctors ?? [];
  }

  get departments() {
    return this.publicSnapshot?.featured_specialties ?? [];
  }

  protected loadPublicSnapshot(): void {
    this.publicErrorMessage = '';

    this.dashboardApiService.getPublicSnapshot().subscribe({
      next: ({ data }) => {
        this.publicSnapshot = data;
      },
      error: (error) => {
        this.publicErrorMessage = error?.error?.message || 'Không thể tải dữ liệu công khai.';
      },
    });
  }

  protected getInitials(value: string | null | undefined): string {
    if (!value) {
      return 'BN';
    }

    const parts = value
      .split(/\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, 2);

    if (parts.length === 0) {
      return 'BN';
    }

    return parts.map((segment) => segment[0]?.toUpperCase() ?? '').join('');
  }

}
