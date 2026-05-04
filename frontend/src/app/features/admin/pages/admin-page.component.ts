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
        <p class="feature-subtitle">Giam sat he thong, quan tri danh muc va xu ly canh bao van hanh.</p>
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
          <h3>Canh bao can xu ly</h3>
          <ul>
            @for (item of alerts; track item) {
              <li>{{ item }}</li>
            }
          </ul>
        </article>

        <article class="feature-card panel">
          <h3>Thao tac nhanh</h3>
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
    { label: 'Nguoi dung he thong', value: '214', note: '+6 trong 24h' },
    { label: 'Lich hen hom nay', value: '214', note: '88% da tiep nhan' },
    { label: 'Phong dang hoat dong', value: '18/21', note: '3 phong bao tri' },
    { label: 'Canh bao he thong', value: '5', note: '2 muc do cao' }
  ];

  alerts = [
    '2 phong kham qua tai trong khung 09:00 - 11:00.',
    '1 bac si nghi dot xuat, can dieu chinh lich truc.',
    'Muc do tre trung binh cua hang doi tang 12%.'
  ];

  quickActions = [
    { label: 'Quan ly nguoi dung', link: '/users' },
    { label: 'Quan ly chuyen khoa', link: '/specialties' },
    { label: 'Quan ly phong kham', link: '/rooms' },
    { label: 'Quan ly bac si', link: '/doctors' },
    { label: 'Dieu phoi lich hen', link: '/appointments' },
    { label: 'Dieu phoi hang doi', link: '/queues' }
  ];
}
