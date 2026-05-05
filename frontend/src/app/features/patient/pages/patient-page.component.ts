import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TokenService } from '../../../core/services/token.service';
import { PortalTopbarComponent } from '../../../shared/components/portal-topbar/portal-topbar.component';

@Component({
  selector: 'app-patient-page',
  standalone: true,
  imports: [RouterLink, PortalTopbarComponent],
  templateUrl: './patient-page.component.html',
  styleUrl: './patient-page.component.scss',
})
export class PatientPageComponent {
  private readonly tokenService = inject(TokenService);

  get isLoggedIn(): boolean {
    return !!this.tokenService.getAccessToken();
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

  trustIndicators = [
    { value: '15+', label: 'Năm đồng hành cùng cộng đồng' },
    { value: '40+', label: 'Bác sĩ chuyên khoa trực tiếp tư vấn' },
    { value: '24/7', label: 'Hỗ trợ đặt lịch và chăm sóc sau khám' },
  ];

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

  doctors = [
    {
      initials: 'HV',
      name: 'BSCKI Nguyễn Văn A',
      specialty: 'Tim mạch',
      description:
        'Có nhiều năm kinh nghiệm trong chẩn đoán sớm bệnh tim mạch, tư vấn điều trị và theo dõi định kỳ.',
    },
    {
      initials: 'TL',
      name: 'ThS.BS Trần Thị B',
      specialty: 'Nội tổng quát',
      description:
        'Tập trung vào khám tổng quát, tầm soát sức khỏe và xây dựng phác đồ phù hợp cho từng bệnh nhân.',
    },
    {
      initials: 'MK',
      name: 'BS Lê Minh K',
      specialty: 'Nhi khoa',
      description:
        'Thân thiện với trẻ em, kết hợp tư vấn dinh dưỡng và chăm sóc theo từng độ tuổi.',
    },
  ];

  departments = [
    {
      name: 'Khám nội tổng quát',
      note: 'Tầm soát sức khỏe định kỳ, tư vấn phòng bệnh và theo dõi bệnh lý mạn tính.',
    },
    {
      name: 'Tim mạch',
      note: 'Chẩn đoán và theo dõi các vấn đề tim mạch với quy trình khám nhanh gọn.',
    },
    {
      name: 'Nhi khoa',
      note: 'Không gian thân thiện cho trẻ em, kết hợp tư vấn dinh dưỡng và lịch tiêm chủng.',
    },
    {
      name: 'Xét nghiệm - Chẩn đoán hình ảnh',
      note: 'Hệ thống máy móc hiện đại giúp rút ngắn thời gian cho kết quả.',
    },
  ];

}
