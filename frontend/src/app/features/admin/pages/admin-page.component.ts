import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <h1 class="feature-title">Dashboard Admin</h1>
        <p class="feature-subtitle">Giám sát hệ thống, quản trị danh mục và xử lý cảnh báo vận hành.</p>
      </header>

      <section class="feature-card kpi-grid">
        @for (card of kpiCards; track card.label) {
          <article class="kpi-item">
            <small>{{ card.label }}</small>
            <strong>{{ card.value }}</strong>
            <span>{{ card.note }}</span>
          </article>
        }
      </section>

      <section class="content-grid">
        <article class="feature-card panel">
          <h3>Cảnh báo cần xử lý</h3>
          <ul>
            @for (item of alerts; track item) {
              <li>{{ item }}</li>
            }
          </ul>
        </article>

        <article class="feature-card panel">
          <h3>Thao tác nhanh</h3>
          <nav class="action-links">
            @for (item of quickActions; track item.link) {
              <a class="role-link" [routerLink]="item.link">{{ item.label }}</a>
            }
          </nav>
        </article>
      </section>
    </section>
  `,
  styles: [
    `
      .kpi-grid {
        display: grid;
        gap: 0.7rem;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .kpi-item {
        border: 1px solid #d4e4f4;
        border-radius: 12px;
        background: #f7fbff;
        padding: 0.75rem;
      }

      .kpi-item small {
        display: block;
        color: #5f7790;
        font-weight: 600;
      }

      .kpi-item strong {
        display: block;
        margin-top: 0.18rem;
        color: #123a5d;
        font-size: 1.3rem;
      }

      .kpi-item span {
        display: block;
        margin-top: 0.2rem;
        color: #6b839c;
        font-size: 0.82rem;
      }

      .content-grid {
        margin-top: 0.9rem;
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      .panel h3 {
        margin: 0 0 0.65rem;
        color: #153450;
      }

      .panel ul {
        margin: 0;
        padding-left: 1rem;
        display: grid;
        gap: 0.5rem;
        color: #274968;
      }

      .action-links {
        display: grid;
        gap: 0.55rem;
      }

      .role-link {
        border: 1px solid #d4e4f4;
        background: #f7fbff;
        border-radius: 12px;
        min-height: 48px;
        display: inline-flex;
        align-items: center;
        padding: 0 0.85rem;
        color: #1a466d;
        font-weight: 600;
      }
    `
  ]
})
export class AdminPageComponent {
  kpiCards = [
    { label: 'Người dùng hệ thống', value: '214', note: '+6 trong 24h' },
    { label: 'Lịch hẹn hôm nay', value: '214', note: '88% đã tiếp nhận' },
    { label: 'Phòng đang hoạt động', value: '18/21', note: '3 phòng bảo trì' },
    { label: 'Cảnh báo hệ thống', value: '5', note: '2 mức độ cao' }
  ];

  alerts = [
    '2 phòng khám quá tải trong khung 09:00 - 11:00.',
    '1 bác sĩ nghỉ đột xuất, cần điều chỉnh lịch trực.',
    'Mức độ trễ trung bình của hàng đợi tăng 12%.'
  ];

  quickActions = [
    { label: 'Quản lý người dùng', link: '/users' },
    { label: 'Quản lý chuyên khoa', link: '/specialties' },
    { label: 'Quản lý phòng khám', link: '/rooms' },
    { label: 'Quản lý bác sĩ', link: '/doctors' },
    { label: 'Điều phối lịch hẹn và hàng đợi', link: '/appointments' }
  ];
}
