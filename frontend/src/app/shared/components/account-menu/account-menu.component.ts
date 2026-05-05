import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-account-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="user-menu" (click)="onMenuClick($event)">
      <button class="user-area" type="button" (click)="toggleMenu($event)">
        <span class="avatar" [class.guest]="!isAuthenticated()">
          @if (isAuthenticated()) {
            {{ userInitials() }}
          } @else {
            <span class="material-symbols-outlined avatar-icon">person</span>
          }
        </span>
        <div class="user-info">
          <strong>{{ userName() }}</strong>
          <small class="role">{{ userRole() }}</small>
        </div>
        <span class="material-symbols-outlined">expand_more</span>
      </button>

      @if (isMenuOpen) {
        <div class="user-dropdown">
          <div class="user-summary">
            <span class="avatar large" [class.guest]="!isAuthenticated()">
              @if (isAuthenticated()) {
                {{ userInitials() }}
              } @else {
                <span class="material-symbols-outlined avatar-icon">person</span>
              }
            </span>
            <div>
              <strong>{{ userName() }}</strong>
              <small>{{ summaryText() }}</small>
            </div>
          </div>

          @if (isAuthenticated()) {
            <button class="dropdown-item" type="button" (click)="onProfileClick()">
              <span class="material-symbols-outlined">person</span>
              <span>Hồ sơ của tôi</span>
            </button>

            <button class="dropdown-item" type="button" (click)="onChangePasswordClick()">
              <span class="material-symbols-outlined">lock_reset</span>
              <span>Đổi mật khẩu</span>
            </button>

            <button class="dropdown-item danger" type="button" (click)="onLogoutClick()">
              <span class="material-symbols-outlined">logout</span>
              <span>Đăng xuất</span>
            </button>
          } @else {
            <button class="dropdown-item" type="button" (click)="onLoginClick()">
              <span class="material-symbols-outlined">login</span>
              <span>Đăng nhập</span>
            </button>

            <button class="dropdown-item" type="button" (click)="onRegisterClick()">
              <span class="material-symbols-outlined">person_add</span>
              <span>Tạo tài khoản</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .user-menu {
        position: relative;
      }

      .user-area {
        border: 1px solid #d3e2f0;
        display: flex;
        align-items: center;
        border-radius: 999px;
        background: #f8fbff;
        color: #17324d;
        min-height: 36px;
        padding: 0.14rem 0.34rem 0.14rem 0.18rem;
        cursor: pointer;
      }

      .avatar {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #edf6ff;
        border: 1px solid #d9ebfb;
        color: #1d6cae;
        font-size: 0.7rem;
        font-weight: 700;
        flex: 0 0 auto;
      }

      .avatar.guest {
        background: #f4f8fc;
        color: #62758a;
      }

      .avatar-icon {
        font-size: 14px;
        line-height: 1;
      }

      .user-info {
        display: grid;
        margin: 0 0.42rem;
        min-width: 132px;
        text-align: left;
      }

      .user-info strong {
        font-size: 0.76rem;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .role {
        color: #6a8299;
        font-size: 0.68rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .user-dropdown {
        position: absolute;
        right: 0;
        top: calc(100% + 0.45rem);
        width: 240px;
        background: #ffffff;
        border: 1px solid #dbe7f3;
        border-radius: 12px;
        box-shadow: rgba(22, 58, 91, 0.16) 0 12px 30px;
        padding: 0.45rem;
        z-index: 50;
      }

      .user-summary {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 0.52rem;
        align-items: center;
        border: 1px solid #d7e8f8;
        background: #f7fbff;
        border-radius: 10px;
        padding: 0.5rem;
        margin-bottom: 0.45rem;
      }

      .user-summary .avatar.large {
        width: 40px;
        height: 40px;
      }

      .user-summary .avatar.large .avatar-icon {
        font-size: 20px;
      }

      .user-summary strong {
        display: block;
        font-size: 0.8rem;
        color: #17324d;
      }

      .user-summary small {
        display: block;
        margin-top: 0.12rem;
        font-size: 0.72rem;
        color: #6a8299;
      }

      .dropdown-item {
        width: 100%;
        border: 0;
        border-radius: 9px;
        background: transparent;
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        gap: 0.62rem;
        padding: 0.55rem 0.52rem;
        text-align: left;
        color: #17324d;
        cursor: pointer;
      }

      .dropdown-item:hover {
        background: #eef6ff;
      }

      .dropdown-item .material-symbols-outlined {
        font-size: 18px;
      }

      .dropdown-item.danger {
        color: #b71c2b;
      }

      .dropdown-item.danger:hover {
        background: #fff1f3;
      }
    `
  ]
})
export class AccountMenuComponent {
  readonly userName = input.required<string>();
  readonly userRole = input.required<string>();
  readonly userEmail = input<string>('no-reply@system.local');
  readonly userInitials = input.required<string>();
  readonly isAuthenticated = input<boolean>(false);

  readonly profile = output<void>();
  readonly changePassword = output<void>();
  readonly logout = output<void>();
  readonly login = output<void>();
  readonly register = output<void>();

  isMenuOpen = false;

  summaryText(): string {
    if (this.isAuthenticated()) {
      return this.userEmail();
    }

    return 'Đặt lịch khám và tra cứu hồ sơ trực tuyến';
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.isMenuOpen = false;
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  onMenuClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  onProfileClick(): void {
    this.isMenuOpen = false;
    this.profile.emit();
  }

  onChangePasswordClick(): void {
    this.isMenuOpen = false;
    this.changePassword.emit();
  }

  onLogoutClick(): void {
    this.isMenuOpen = false;
    this.logout.emit();
  }

  onLoginClick(): void {
    this.isMenuOpen = false;
    this.login.emit();
  }

  onRegisterClick(): void {
    this.isMenuOpen = false;
    this.register.emit();
  }
}
