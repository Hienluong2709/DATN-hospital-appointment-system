import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TokenService } from '../../../core/services/token.service';
import { CHANGE_PASSWORD_PATH, PROFILE_PATH } from '../../../shared/constant/navigator-endpoint.constant';
import { AccountMenuComponent } from '../../../shared/components/account-menu/account-menu.component';

@Component({
  selector: 'app-patient-page',
  standalone: true,
  imports: [RouterLink, AccountMenuComponent],
  templateUrl: './patient-page.component.html',
  styleUrl: './patient-page.component.scss'
})
export class PatientPageComponent {
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  get isLoggedIn(): boolean {
    return !!this.tokenService.getAccessToken();
  }

  trustIndicators = [
    { value: '15+', label: 'Năm đồng hành cùng cộng đồng' },
    { value: '40+', label: 'Bác sĩ chuyên khoa trực tiếp tư vấn' },
    { value: '24/7', label: 'Hỗ trợ đặt lịch và chăm sóc sau khám' }
  ];

  bookingSteps = [
    {
      step: '01',
      title: 'Xem thông tin công khai',
      description: 'Tìm hiểu chuyên khoa, bác sĩ và các lưu ý trước khi khám ngay trên trang bệnh viện.'
    },
    {
      step: '02',
      title: 'Đăng nhập hoặc tạo tài khoản',
      description: 'Bệnh nhân chỉ cần đăng nhập khi bắt đầu đặt lịch hoặc muốn theo dõi lịch hẹn trực tuyến.'
    },
    {
      step: '03',
      title: 'Đặt lịch và theo dõi lịch hẹn',
      description: 'Chọn chuyên khoa, ngày khám và bác sĩ còn nhận lịch, sau đó quản lý lịch khám trong cổng bệnh nhân.'
    }
  ];

  featuredBenefits = [
    {
      title: 'Không gian khám thân thiện',
      description: 'Khu tiếp đón và phòng khám sắp xếp thông thoáng, hướng dẫn rõ từng bước cho bệnh nhân.'
    },
    {
      title: 'Minh bạch chi phí',
      description: 'Bảng giá dịch vụ được cập nhật công khai, có tư vấn chi tiết trước khi thực hiện.'
    },
    {
      title: 'Theo dõi liên tục',
      description: 'Bệnh án điện tử và lịch sử tái khám giúp theo sát tiến trình hồi phục của bạn.'
    }
  ];

  doctors = [
    {
      initials: 'HV',
      name: 'BSCKI Nguyễn Văn A',
      specialty: 'Tim mạch',
      description: 'Có nhiều năm kinh nghiệm trong chẩn đoán sớm bệnh tim mạch, tư vấn điều trị và theo dõi định kỳ.'
    },
    {
      initials: 'TL',
      name: 'ThS.BS Trần Thị B',
      specialty: 'Nội tổng quát',
      description: 'Tập trung vào khám tổng quát, tầm soát sức khỏe và xây dựng phác đồ phù hợp cho từng bệnh nhân.'
    },
    {
      initials: 'MK',
      name: 'BS Lê Minh K',
      specialty: 'Nhi khoa',
      description: 'Thân thiện với trẻ em, kết hợp tư vấn dinh dưỡng và chăm sóc theo từng độ tuổi.'
    }
  ];

  departments = [
    { name: 'Khám nội tổng quát', note: 'Tầm soát sức khỏe định kỳ, tư vấn phòng bệnh và theo dõi bệnh lý mạn tính.' },
    { name: 'Tim mạch', note: 'Chẩn đoán và theo dõi các vấn đề tim mạch với quy trình khám nhanh gọn.' },
    { name: 'Nhi khoa', note: 'Không gian thân thiện cho trẻ em, kết hợp tư vấn dinh dưỡng và lịch tiêm chủng.' },
    { name: 'Xét nghiệm - Chẩn đoán hình ảnh', note: 'Hệ thống máy móc hiện đại giúp rút ngắn thời gian cho kết quả.' }
  ];

  get accountLabel(): string {
    const currentUser = this.tokenService.getCurrentUser();
    const candidates = [
      currentUser?.['fullName'],
      currentUser?.['fullname'],
      currentUser?.['name'],
      currentUser?.['username'],
      currentUser?.['email']
    ];

    const best = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return this.asText(best, 'Tài khoản bệnh nhân');
  }

  get accountRoleLabel(): string {
    return this.tokenService.getCurrentRole() ?? 'PATIENT';
  }

  get accountInitials(): string {
    const value = this.accountLabel.trim();
    if (!value || value === 'Tài khoản bệnh nhân') {
      return 'PT';
    }

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
      if (initials) {
        return initials;
      }
    }

    return value.slice(0, 2).toUpperCase() || 'PT';
  }

  get accountLink(): string {
    return this.tokenService.getAccessToken() ? '/patient/appointments' : '/login';
  }

  get accountEmail(): string {
    const currentUser = this.tokenService.getCurrentUser();
    const email = currentUser?.['email'];
    return typeof email === 'string' && email.trim().length > 0 ? email.trim() : '';
  }

  goToProfile(): void {
    void this.router.navigateByUrl(`/patient/${PROFILE_PATH}`);
  }

  goToChangePassword(): void {
    void this.router.navigateByUrl(`/patient/${CHANGE_PASSWORD_PATH}`);
  }

  onLogout(): void {
    this.tokenService.clearSession();
    void this.router.navigateByUrl('/');
  }

  goToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  private asText(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }
}
