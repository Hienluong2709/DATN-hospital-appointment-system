import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-doctor-portal-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <h1 class="feature-title">Dashboard Bac si</h1>
        <p class="feature-subtitle">Quan ly lich kham trong ca, do uu tien benh nhan va khuyen nghi dieu phoi.</p>
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
          <h3>Lich can chu y</h3>
          <ul>
            @for (item of priorities; track item) {
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
export class DoctorPortalPageComponent {
  kpiCards = [
    { label: 'Lich kham hom nay', value: '22', note: '15 da hoan tat' },
    { label: 'Benh nhan dang cho', value: '6', note: 'ca sang phong 03' },
    { label: 'Ca truc hien tai', value: '08:00 - 16:00', note: 'con 3h 25p' },
    { label: 'Ho so can ky duyet', value: '4', note: 'uu tien trong 30 phut' }
  ];

  priorities = [
    '02 benh nhan can hoi chan chuyen khoa tim mach.',
    '01 ho so tai kham can cap nhat toa thuoc moi.',
    '03 benh nhan tre em dang cho tren 20 phut.'
  ];

  quickActions = [
    { label: 'Lich lam viec cua toi', link: '/work-schedules' },
    { label: 'Danh sach lich hen', link: '/appointments' },
    { label: 'Hang doi dang cho', link: '/queues' },
    { label: 'Ho so ca nhan', link: '/profile' },
    { label: 'Doi mat khau', link: '/change-password' }
  ];
}
