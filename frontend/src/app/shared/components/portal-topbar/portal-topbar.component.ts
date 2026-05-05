import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { TokenService } from '../../../core/services/token.service';
import {
  CHANGE_PASSWORD_PATH,
  PROFILE_PATH,
} from '../../constant/navigator-endpoint.constant';
import { AccountMenuComponent } from '../account-menu/account-menu.component';

@Component({
  selector: 'app-portal-topbar',
  standalone: true,
  imports: [AccountMenuComponent],
  template: `
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand">
          <span class="material-symbols-outlined logo">health_and_safety</span>
          <div>
            <strong>Hospital System</strong>
            <small>Digital Clinic Platform</small>
          </div>
        </div>

        <div class="breadcrumb" aria-label="Breadcrumb">
          <span>Dashboard</span>
          <span class="divider">/</span>
          <span>{{ breadcrumbLabel() }}</span>
        </div>
      </div>

      <div class="topbar-right" aria-label="Tiện ích nhanh">
        <div class="search-box" aria-label="Tìm kiếm nhanh">
          <span class="material-symbols-outlined">search</span>
          <input type="text" placeholder="Tìm kiếm ..." />
        </div>

        @if (isAuthenticated()) {
          <button class="top-action" type="button">
            <span class="material-symbols-outlined">notifications</span>
            <span class="badge">3</span>
          </button>
        }

        <button class="top-action" type="button">
          <span class="material-symbols-outlined">settings</span>
        </button>

        <app-account-menu
          [userName]="accountLabel"
          [userRole]="accountRoleLabel"
          [userEmail]="accountEmail"
          [userInitials]="accountInitials"
          [isAuthenticated]="isAuthenticated()"
          (profile)="goToProfile()"
          (changePassword)="goToChangePassword()"
          (logout)="onLogout()"
          (login)="goToLogin()"
          (register)="goToRegister()" />
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 68px;
        padding: 0 1.1rem;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        border-bottom: 1px solid #dbe7f3;
        box-shadow: rgba(20, 53, 84, 0.08) 0 8px 20px;
      }

      .topbar-left {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        min-width: 0;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      .logo {
        font-size: 1.45rem;
        color: #1d6cae;
      }

      .brand strong {
        display: block;
        font-size: 0.92rem;
        font-weight: 700;
        letter-spacing: 0.015em;
        color: #0f385f;
      }

      .brand small {
        display: block;
        margin-top: 0.05rem;
        font-size: 0.74rem;
        color: #6a8299;
      }

      .breadcrumb {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-height: 34px;
        padding: 0 0.68rem;
        border-radius: 999px;
        background: #edf6ff;
        border: 1px solid #d9ebfb;
        color: #4d6b86;
        font-size: 0.76rem;
        white-space: nowrap;
      }

      .divider {
        color: #8aa5bd;
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin-left: auto;
      }

      .search-box {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-height: 36px;
        min-width: 240px;
        background: #f4f8fc;
        border: 1px solid #d5e3f1;
        border-radius: 10px;
        padding: 0 0.68rem;
        color: #65829d;
      }

      .search-box input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        font: inherit;
        color: #17324d;
      }

      .top-action {
        border: 1px solid #d3e2f0;
        background: #f8fbff;
        color: #155286;
        min-height: 36px;
        border-radius: 10px;
        cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
        width: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .top-action:hover {
        background: #eef6ff;
        border-color: #bdd6ec;
      }

      .top-action:active {
        transform: translateY(1px);
      }

      .badge {
        position: absolute;
        top: -5px;
        right: -5px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 999px;
        background: #d93f4d;
        color: #fff;
        font-size: 0.64rem;
        line-height: 18px;
        text-align: center;
        font-weight: 700;
      }

      @media (max-width: 900px) {
        .topbar {
          flex-direction: column;
          align-items: stretch;
          padding: 0.85rem 1rem;
        }

        .topbar-left {
          flex-direction: column;
          align-items: flex-start;
        }

        .topbar-right {
          flex-wrap: wrap;
          justify-content: flex-start;
        }

        .search-box {
          min-width: 0;
          flex: 1 1 100%;
        }
      }
    `,
  ],
})
export class PortalTopbarComponent {
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  readonly breadcrumbLabel = input<string>('Overview');
  readonly isAuthenticated = input<boolean>(false);
  readonly portal = input<'patient' | 'staff'>('patient');

  get accountLabel(): string {
    if (!this.isAuthenticated()) {
      return 'Đăng nhập / Đăng ký';
    }

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

    return this.asText(best, 'Tài khoản');
  }

  get accountRoleLabel(): string {
    if (!this.isAuthenticated()) {
      return 'Đặt lịch, tra cứu hồ sơ';
    }

    return this.tokenService.getCurrentRole() ?? 'PATIENT';
  }

  get accountInitials(): string {
    if (!this.isAuthenticated()) {
      return 'DK';
    }

    const value = this.accountLabel.trim();
    if (!value || value === 'Tài khoản') {
      return 'PT';
    }

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const initials = parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
      if (initials) {
        return initials;
      }
    }

    return value.slice(0, 2).toUpperCase() || 'PT';
  }

  get accountEmail(): string {
    const currentUser = this.tokenService.getCurrentUser();
    const email = currentUser?.['email'];
    return typeof email === 'string' && email.trim().length > 0
      ? email.trim()
      : '';
  }

  goToProfile(): void {
    void this.router.navigateByUrl(this.portalLink(PROFILE_PATH));
  }

  goToChangePassword(): void {
    void this.router.navigateByUrl(this.portalLink(CHANGE_PASSWORD_PATH));
  }

  onLogout(): void {
    this.tokenService.clearSession();
    void this.router.navigateByUrl(this.portal() === 'staff' ? '/staff/login' : '/');
  }

  goToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  goToRegister(): void {
    void this.router.navigateByUrl('/register');
  }

  private portalLink(childPath: string): string {
    return this.portal() === 'staff'
      ? `/staff/${childPath}`
      : `/patient/${childPath}`;
  }

  private asText(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallback;
  }
}
