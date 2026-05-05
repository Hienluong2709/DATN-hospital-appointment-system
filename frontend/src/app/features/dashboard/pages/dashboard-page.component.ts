import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <h1 class="feature-title">Dashboard</h1>
        <p class="feature-subtitle">Tong quan nhanh ve cac khu vuc nghiep vu va dieu huong thao tac chinh.</p>
      </header>

      <section class="feature-card feature-card-grid">
        <article class="feature-stat">
          <label>Chuyen khoa</label>
          <strong>12</strong>
        </article>
        <article class="feature-stat">
          <label>Bac si</label>
          <strong>86</strong>
        </article>
        <article class="feature-stat">
          <label>Lich hen hom nay</label>
          <strong>214</strong>
        </article>
        <article class="feature-stat">
          <label>So thu tu dang cho</label>
          <strong>37</strong>
        </article>
      </section>

      <section class="feature-card quick-links">
        <h3>Truy cap nhanh</h3>
        <nav>
          <a routerLink="/staff/specialties">Danh muc chuyen khoa</a>
          <a routerLink="/staff/rooms">Danh muc phong kham</a>
          <a routerLink="/staff/doctors">Danh sach bac si</a>
          <a routerLink="/staff/work-schedules">Lich lam viec</a>
          <a routerLink="/staff/appointments">Lich hen kham</a>
          <a routerLink="/staff/queues">Hang doi</a>
          <a routerLink="/staff/equeue-numbers">So thu tu dien tu</a>
        </nav>
      </section>
    </section>
  `,
  styles: [
    `
      .quick-links {
        margin-top: 0.9rem;
      }

      .quick-links h3 {
        margin: 0 0 0.8rem;
        color: #153450;
      }

      .quick-links nav {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .quick-links a {
        display: inline-block;
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        border: 1px solid #d2e2f1;
        color: #1f4568;
        background: #f8fcff;
      }
    `
  ]
})
export class DashboardPageComponent {}
