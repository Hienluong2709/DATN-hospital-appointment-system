import { NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TokenService } from '../../../core/services/token.service';
import { environment } from '../../../../environments/environment';
import { PortalTopbarComponent } from '../../../shared/components/portal-topbar/portal-topbar.component';
import { DashboardApiService } from '../../../shared/services/dashboard.api';
import { getAppointmentStatusLabel } from '../../../shared/enum-label.util';
import { PatientDashboardSummary, PublicDashboardSnapshot } from '../../../shared/types/dashboard.type';

type PatientDashboardDoctor = PublicDashboardSnapshot['featured_doctors'][number];
type PatientDashboardSpecialty = PublicDashboardSnapshot['featured_specialties'][number];

@Component({
  selector: 'app-patient-page',
  standalone: true,
  imports: [NgClass, RouterLink, PortalTopbarComponent],
  templateUrl: './patient-page.component.html',
  styleUrl: './patient-page.component.scss',
})
export class PatientPageComponent {
  private readonly tokenService = inject(TokenService);
  private readonly dashboardApiService = inject(DashboardApiService);

  protected publicSnapshot: PublicDashboardSnapshot | null = null;
  protected patientSummary: PatientDashboardSummary | null = null;
  protected publicErrorMessage = '';
  protected patientSummaryErrorMessage = '';
  protected isLoadingPatientSummary = false;

  get isLoggedIn(): boolean {
    return this.tokenService.hasValidSession() || (!!environment.disableAuthAutoLogout && !!this.tokenService.getCurrentUser());
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
    if (this.isLoggedIn) {
      this.loadPatientSummary();
    }
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

  protected loadPatientSummary(): void {
    this.isLoadingPatientSummary = true;
    this.patientSummaryErrorMessage = '';

    this.dashboardApiService.getSummary().subscribe({
      next: ({ data }) => {
        if (data.role !== 'PATIENT') {
          this.patientSummary = null;
          this.patientSummaryErrorMessage = 'Dữ liệu trả về không đúng với vai trò bệnh nhân.';
          this.isLoadingPatientSummary = false;
          return;
        }

        this.patientSummary = data;
        this.isLoadingPatientSummary = false;
      },
      error: (error) => {
        this.patientSummary = null;
        this.patientSummaryErrorMessage = error?.error?.message || 'Không thể tải dữ liệu lịch khám cá nhân.';
        this.isLoadingPatientSummary = false;
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

  protected getDoctorVisualStyle(doctor: PatientDashboardDoctor, index: number): string {
    const paletteIndex = Math.abs((doctor.id ?? index) + index) % this.doctorVisualPalettes.length;
    const palette = this.doctorVisualPalettes[paletteIndex];

    return [
      `background: radial-gradient(circle at 72% 24%, ${palette.highlight} 0 8%, transparent 9%)`,
      `, radial-gradient(circle at 22% 28%, rgba(255, 255, 255, 0.92) 0 13%, transparent 14%)`,
      `, linear-gradient(135deg, ${palette.start} 0%, ${palette.end} 100%)`,
    ].join('');
  }

  protected getSpecialtyVisualStyle(specialty: PatientDashboardSpecialty, index: number): string {
    const paletteIndex = Math.abs((specialty.id ?? index) + index) % this.specialtyVisualPalettes.length;
    const palette = this.specialtyVisualPalettes[paletteIndex];

    return [
      `background: radial-gradient(circle at 78% 22%, ${palette.highlight} 0 11%, transparent 12%)`,
      `, radial-gradient(circle at 22% 75%, rgba(255, 255, 255, 0.7) 0 16%, transparent 17%)`,
      `, linear-gradient(135deg, ${palette.start} 0%, ${palette.end} 100%)`,
    ].join('');
  }

  protected getSpecialtyShortName(name: string | null | undefined): string {
    const value = (name || '').trim();
    if (!value) {
      return 'CK';
    }

    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('');
  }

  protected getDoctorImageUrl(doctor: PatientDashboardDoctor, index: number): string {
    const imageIndex = index % this.doctorImageUrls.length;
    return this.doctorImageUrls[imageIndex];
  }

  protected getDoctorImagePosition(index: number): string {
    const positions = ['center 18%', 'center 20%', 'center 16%', 'center 18%'];
    return positions[index % positions.length];
  }

  protected getDoctorDescription(doctor: PatientDashboardDoctor): string {
    const description = doctor.description?.trim();
    if (description) {
      return description;
    }

    const specialty = doctor.specialty?.trim();
    return specialty
      ? `Tư vấn, thăm khám và theo dõi các vấn đề thuộc chuyên khoa ${specialty.toLowerCase()}.`
      : 'Tư vấn, thăm khám và theo dõi sức khỏe cho bệnh nhân theo lịch hẹn.';
  }

  protected formatTime(value: string | null | undefined): string {
    return value ? value.slice(0, 5) : '--:--';
  }

  protected getPatientAppointmentStatusClass(status: string): string {
    switch (status) {
      case 'Pending':
        return 'status-badge--pending';
      case 'Confirmed':
      case 'CheckedIn':
        return 'status-badge--confirmed';
      case 'Completed':
        return 'status-badge--completed';
      case 'Cancelled':
      case 'NoShow':
        return 'status-badge--cancelled';
      default:
        return '';
    }
  }

  protected getSpecialtyImageUrl(specialty: PatientDashboardSpecialty, index: number): string {
    const name = (specialty.name || '').toLowerCase();
    const matchedEntry = this.specialtyImageEntries.find((entry) =>
      entry.keywords.some((keyword) => name.includes(keyword)),
    );

    if (matchedEntry) {
      return matchedEntry.url;
    }

    const imageIndex = Math.abs((specialty.id ?? index) + index) % this.specialtyFallbackImageUrls.length;
    return this.specialtyFallbackImageUrls[imageIndex];
  }

  private readonly doctorVisualPalettes = [
    { start: '#dff3ff', end: '#9dd1f3', highlight: 'rgba(21, 82, 134, 0.24)' },
    { start: '#e8f8f3', end: '#a8e0cf', highlight: 'rgba(22, 118, 85, 0.22)' },
    { start: '#eef4ff', end: '#b8cdfa', highlight: 'rgba(37, 99, 235, 0.22)' },
    { start: '#fff7ed', end: '#fed7aa', highlight: 'rgba(217, 119, 6, 0.2)' },
  ];

  private readonly specialtyVisualPalettes = [
    { start: '#e0f2fe', end: '#7dd3fc', highlight: 'rgba(14, 116, 144, 0.22)' },
    { start: '#dcfce7', end: '#86efac', highlight: 'rgba(22, 101, 52, 0.2)' },
    { start: '#fef3c7', end: '#fcd34d', highlight: 'rgba(146, 64, 14, 0.18)' },
    { start: '#ede9fe', end: '#c4b5fd', highlight: 'rgba(91, 33, 182, 0.18)' },
    { start: '#ffe4e6', end: '#fda4af', highlight: 'rgba(190, 18, 60, 0.18)' },
  ];

  private readonly doctorImageUrls = [
    'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&crop=faces&w=900&h=520&q=80',
    'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&crop=faces&w=900&h=520&q=80',
    'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&crop=faces&w=900&h=520&q=80',
    'https://images.unsplash.com/photo-1618498082410-b4aa22193b38?auto=format&fit=crop&crop=faces&w=900&h=520&q=80',
  ];

  private readonly specialtyImageEntries = [
    {
      keywords: ['tim', 'mạch', 'cardio'],
      url: 'https://images.unsplash.com/photo-1628348070889-cb656235b4eb?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['da', 'liễu', 'lieu', 'derma'],
      url: 'https://images.unsplash.com/photo-1616391182219-e080b4d1043a?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['nhi', 'trẻ', 'tre', 'pediatric'],
      url: 'https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['nội', 'noi', 'tổng', 'tong', 'general'],
      url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['tai', 'mũi', 'mui', 'họng', 'hong'],
      url: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['sản', 'san', 'phụ', 'phu'],
      url: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['thần', 'than', 'kinh'],
      url: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=900&q=80',
    },
    {
      keywords: ['tiêu', 'tieu', 'hóa', 'hoa'],
      url: 'https://images.unsplash.com/photo-1579684288402-e3e337bcc7af?auto=format&fit=crop&w=900&q=80',
    },
  ];

  private readonly specialtyFallbackImageUrls = [
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=900&q=80',
  ];

  protected readonly getAppointmentStatusLabel = getAppointmentStatusLabel;
}
