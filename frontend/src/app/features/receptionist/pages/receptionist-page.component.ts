import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-receptionist-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <h1 class="feature-title">Dashboard Le tan</h1>
        <p class="feature-subtitle">Theo doi luong tiep don, xu ly check-in va cap nhat hang doi theo thoi gian thuc.</p>
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
          <h3>Cong viec uu tien</h3>
          <ul>
            @for (item of priorityTasks; track item) {
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
export class ReceptionistPageComponent {
  kpiCards = [
    { label: 'Check-in cho xu ly', value: '24', note: '7 benh nhan moi 15 phut qua' },
    { label: 'So thu tu dang cho', value: '37', note: 'TB cho: 11 phut' },
    { label: 'Lich hen sap toi', value: '18', note: 'trong 60 phut tiep theo' },
    { label: 'Lech lich can xu ly', value: '4', note: 'can doi phong / doi bac si' }
  ];

  priorityTasks = [
    'Xac nhan 6 lich hen chua check-in.',
    'Dieu chinh 2 benh nhan sang phong kham du phong.',
    'Cap so uu tien cho 1 truong hop cap cuu.'
  ];

  quickActions = [
    { label: 'Xem lich hen kham', link: '/appointments' },
    { label: 'Xem lich lam viec', link: '/work-schedules' },
    { label: 'Xem lich nghi', link: '/work-schedule-blocks' },
    { label: 'Quan ly hang doi', link: '/queues' },
    { label: 'Cap so thu tu', link: '/equeue-numbers' },
    { label: 'Tra cuu phong kham', link: '/rooms' },
    { label: 'Tra cuu bac si', link: '/doctors' }
  ];
}
