import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthApiService } from '../services/auth.api';
import { TokenService } from '../../../core/services/token.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="login-shell">
      <div class="login-shape login-shape--top"></div>
      <div class="login-shape login-shape--bottom"></div>
      <div class="login-dots login-dots--top" aria-hidden="true"></div>
      <div class="login-dots login-dots--bottom" aria-hidden="true"></div>

      <div class="login-stage">
        <header class="login-brand">
          <div class="login-brand__mark" aria-hidden="true">
            <span></span>
          </div>
          <div class="login-brand__text">Luong's Hospital</div>
        </header>

        <div class="login-layout">
          <section class="login-visual">
            <div class="login-visual__heart" aria-hidden="true">
              <span class="material-symbols-outlined">ecg_heart</span>
            </div>

            <div class="login-visual__calendar" aria-hidden="true">
              <span class="material-symbols-outlined">calendar_month</span>
            </div>

            <div class="login-visual__shield" aria-hidden="true">
              <span class="material-symbols-outlined">health_and_safety</span>
            </div>

            <div class="login-visual__media">
              <img
                src="assets/login/hospital-login-hero.png"
                alt="Bác sĩ và bệnh nhân trao đổi trên thiết bị số trong môi trường bệnh viện"
              />
            </div>

            <div class="login-highlights">
              <article class="login-highlights__item">
                <div class="login-highlights__icon">
                  <span class="material-symbols-outlined">calendar_add_on</span>
                </div>
                <strong>Đặt lịch dễ dàng</strong>
              </article>

              <article class="login-highlights__item">
                <div class="login-highlights__icon">
                  <span class="material-symbols-outlined">shield_locked</span>
                </div>
                <strong>An toàn dữ liệu</strong>
              </article>

              <article class="login-highlights__item">
                <div class="login-highlights__icon">
                  <span class="material-symbols-outlined">favorite</span>
                </div>
                <strong>Chăm sóc tận tâm</strong>
              </article>
            </div>
          </section>

          <section class="login-panel">
            <div class="login-card">
              <p class="login-card__kicker">
                <span class="material-symbols-outlined">calendar_add_on</span>
                <span>{{ audience === 'staff' ? 'Cổng nội bộ bệnh viện' : 'Cổng bệnh nhân' }}</span>
              </p>

              <h1>{{ audience === 'staff' ? 'Đăng nhập nội bộ' : 'Đăng nhập bệnh nhân' }}</h1>
              <p class="login-card__subtitle">
                {{
                  audience === 'staff'
                    ? 'Dành cho quản trị viên, lễ tân và bác sĩ truy cập khu vực quản lý nội bộ của bệnh viện.'
                    : 'Đăng nhập để đặt lịch khám, theo dõi lịch hẹn và quản lý hồ sơ bệnh nhân của bạn.'
                }}
              </p>

              <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
                <label class="field">
                  <span class="field__label">Tên đăng nhập</span>
                  <div class="field__control">
                    <span class="material-symbols-outlined">person</span>
                    <input
                      type="text"
                      formControlName="username"
                      autocomplete="username"
                      placeholder="Nhập tên đăng nhập"
                    />
                  </div>
                  <small
                    class="field__error"
                    *ngIf="loginForm.controls.username.touched && loginForm.controls.username.invalid"
                  >
                    Vui lòng nhập tên đăng nhập.
                  </small>
                </label>

                <label class="field">
                  <span class="field__label">Mật khẩu</span>
                  <div class="field__control">
                    <span class="material-symbols-outlined">lock</span>
                    <input
                      [type]="showPassword ? 'text' : 'password'"
                      formControlName="password"
                      autocomplete="current-password"
                      placeholder="Nhập mật khẩu"
                    />
                    <button
                      class="field__toggle"
                      type="button"
                      (click)="showPassword = !showPassword"
                      [attr.aria-label]="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                    >
                      <span class="material-symbols-outlined">
                        {{ showPassword ? 'visibility_off' : 'visibility' }}
                      </span>
                    </button>
                  </div>
                  <small
                    class="field__error"
                    *ngIf="loginForm.controls.password.touched && loginForm.controls.password.invalid"
                  >
                    Vui lòng nhập mật khẩu.
                  </small>
                </label>

                <div class="login-form__row">
                  <label class="remember-toggle">
                    <input type="checkbox" [(ngModel)]="rememberMe" [ngModelOptions]="{ standalone: true }" />
                    <span>Ghi nhớ đăng nhập</span>
                  </label>

                  <a *ngIf="audience === 'patient'; else staffForgotPasswordLabel" routerLink="/forgot-password" class="login-form__ghost-link">Quên mật khẩu?</a>
                  <ng-template #staffForgotPasswordLabel>
                    <span class="login-form__ghost-link">Quên mật khẩu?</span>
                  </ng-template>
                </div>

                <p *ngIf="errorMessage" class="error-banner">
                  <span class="material-symbols-outlined">error</span>
                  <span>{{ errorMessage }}</span>
                </p>

                <button class="submit-button" type="submit" [disabled]="isSubmitting">
                  {{ isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập' }}
                </button>

                <div class="divider" *ngIf="audience === 'patient'">
                  <span>hoặc</span>
                </div>

                <button class="secondary-button" type="button" (click)="onSecondaryAction()" *ngIf="audience === 'patient'">
                  <span class="material-symbols-outlined">person_add</span>
                  <span>Đăng ký tài khoản</span>
                </button>
              </form>

              <p class="login-card__policy">
                Bằng việc đăng nhập, bạn đồng ý với
                <span class="login-card__policy-link">Điều khoản sử dụng</span>
                và
                <span class="login-card__policy-link">Chính sách bảo mật</span>.
              </p>

              <p class="login-card__switch">
                <a *ngIf="audience === 'patient'" routerLink="/">Quay lại trang bệnh viện</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .login-shell {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        padding: 0.9rem;
        background: linear-gradient(180deg, #eff6fd 0%, #f8fbff 100%);
      }

      .login-stage {
        position: absolute;
        inset: 0;
        margin: 0.9rem;
        padding: 2rem 2.2rem;
        border-radius: 28px;
        border: 1px solid rgba(206, 224, 238, 0.88);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 250, 255, 0.96));
        box-shadow: 0 18px 50px rgba(27, 74, 109, 0.1);
        overflow: hidden;
      }

      .login-shape {
        position: absolute;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(129, 190, 231, 0.28), rgba(129, 190, 231, 0.06) 70%);
        pointer-events: none;
      }

      .login-shape--top {
        top: -180px;
        right: 120px;
        width: 760px;
        height: 420px;
      }

      .login-shape--bottom {
        left: -60px;
        bottom: -190px;
        width: 580px;
        height: 320px;
      }

      .login-dots {
        position: absolute;
        width: 86px;
        height: 56px;
        background-image: radial-gradient(circle, rgba(105, 166, 213, 0.55) 2px, transparent 2px);
        background-size: 18px 18px;
        pointer-events: none;
      }

      .login-dots--top {
        top: 3rem;
        right: 2.8rem;
      }

      .login-dots--bottom {
        left: 2.2rem;
        bottom: 2.4rem;
      }

      .login-brand {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 0.9rem;
      }

      .login-brand__mark {
        position: relative;
        width: 54px;
        height: 54px;
        border-radius: 18px;
        background: linear-gradient(180deg, #2cb1d1, #1389bd);
        box-shadow: 0 14px 28px rgba(23, 132, 185, 0.2);
      }

      .login-brand__mark::before,
      .login-brand__mark::after,
      .login-brand__mark span {
        content: '';
        position: absolute;
        background: #ffffff;
        border-radius: 999px;
      }

      .login-brand__mark::before {
        inset: 12px 22px;
      }

      .login-brand__mark::after {
        inset: 22px 12px;
      }

      .login-brand__mark span {
        width: 20px;
        height: 20px;
        right: -4px;
        top: 18px;
        background: #0f4d8c;
      }

      .login-brand__text {
        font-size: 2.05rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: #123a67;
      }

      .login-layout {
        position: relative;
        z-index: 1;
        height: calc(100% - 72px);
        margin-top: 1.1rem;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(430px, 500px);
        gap: 2rem;
        align-items: center;
      }

      .login-visual {
        position: relative;
        min-height: 720px;
      }

      .login-visual::before {
        content: '';
        position: absolute;
        left: -4%;
        top: 3%;
        width: 92%;
        height: 82%;
        border-radius: 48% 52% 44% 56% / 42% 43% 57% 58%;
        background: linear-gradient(180deg, rgba(191, 223, 246, 0.72), rgba(222, 238, 251, 0.42));
      }

      .login-visual__media {
        position: absolute;
        left: 0;
        top: 10%;
        width: min(100%, 720px);
        border-radius: 42px;
        overflow: hidden;
        box-shadow: 0 28px 60px rgba(29, 79, 111, 0.14);
      }

      .login-visual__media img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: cover;
      }

      .login-visual__heart,
      .login-visual__calendar,
      .login-visual__shield {
        position: absolute;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #76aee1;
        background: rgba(233, 245, 255, 0.95);
        box-shadow: 0 18px 40px rgba(74, 128, 166, 0.12);
      }

      .login-visual__heart {
        left: 3%;
        top: 18%;
        background: transparent;
        box-shadow: none;
      }

      .login-visual__heart .material-symbols-outlined {
        font-size: 66px;
      }

      .login-visual__calendar {
        top: 27%;
        right: 17%;
        width: 106px;
        height: 106px;
        border-radius: 28px;
      }

      .login-visual__calendar .material-symbols-outlined {
        font-size: 48px;
      }

      .login-visual__shield {
        right: 6%;
        bottom: 23%;
        width: 114px;
        height: 114px;
        border-radius: 30px;
      }

      .login-visual__shield .material-symbols-outlined {
        font-size: 54px;
      }

      .login-highlights {
        position: absolute;
        left: 2rem;
        bottom: 0;
        width: min(100%, 520px);
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
        padding: 1.4rem 1.3rem;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(214, 229, 241, 0.9);
        box-shadow: 0 20px 45px rgba(30, 77, 109, 0.1);
      }

      .login-highlights__item {
        display: grid;
        gap: 0.65rem;
        text-align: center;
        color: #17466c;
      }

      .login-highlights__icon {
        width: 56px;
        height: 56px;
        margin: 0 auto;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(180deg, #eef8ff, #dceffc);
        color: #1791bb;
      }

      .login-highlights__icon .material-symbols-outlined {
        font-size: 29px;
      }

      .login-highlights__item strong {
        font-size: 0.95rem;
        line-height: 1.35;
      }

      .login-panel {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .login-card {
        width: min(100%, 460px);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(218, 230, 240, 0.92);
        box-shadow: 0 24px 60px rgba(17, 59, 90, 0.12);
        padding: 2rem 1.7rem 1.5rem;
      }

      .login-card__kicker {
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.55rem;
        color: #168eb7;
        font-size: 0.82rem;
        font-weight: 700;
        width: 100%;
      }

      .login-card__kicker .material-symbols-outlined {
        font-size: 24px;
      }

      .login-card h2 {
        display: none;
      }

      .login-card h1 {
        margin: 0.7rem 0 0;
        font-size: 4rem;
        line-height: 1;
        letter-spacing: -0.05em;
        color: #143663;
        text-align: center;
      }

      .login-card__subtitle {
        margin: 1rem 0 0;
        max-width: 340px;
        color: #71839a;
        font-size: 0.98rem;
        line-height: 1.6;
        text-align: center;
        margin-left: auto;
        margin-right: auto;
      }

      .login-form {
        margin-top: 1.8rem;
        display: grid;
        gap: 1.1rem;
      }

      .field {
        display: grid;
        gap: 0.5rem;
      }

      .field__label {
        font-size: 0.82rem;
        font-weight: 700;
        color: #20324e;
      }

      .field__control {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        min-height: 58px;
        padding: 0 0.95rem;
        border-radius: 16px;
        border: 1px solid #d4dee9;
        background: #ffffff;
        transition:
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;
      }

      .field__control:focus-within {
        border-color: #1791bb;
        box-shadow: 0 0 0 4px rgba(23, 145, 187, 0.12);
      }

      .field__control .material-symbols-outlined {
        color: #8d9caf;
        font-size: 20px;
      }

      .field input {
        width: 100%;
        border: 0;
        outline: none;
        background: transparent;
        color: #17324d;
        font: inherit;
      }

      .field input::placeholder {
        color: #97a6b6;
      }

      .field__toggle {
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #6b879d;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.16s ease, color 0.16s ease;
      }

      .field__toggle:hover {
        background: #eef6fb;
        color: #104a72;
      }

      .field__error {
        color: #b42332;
        font-size: 0.82rem;
      }

      .login-form__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-top: -0.1rem;
      }

      .remember-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        color: #334a67;
        font-size: 0.92rem;
        cursor: pointer;
      }

      .remember-toggle input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: #1791bb;
      }

      .login-form__ghost-link {
        color: #1b81d3;
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
      }

      .error-banner {
        margin: 0;
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 0.55rem;
        align-items: start;
        padding: 0.85rem 0.9rem;
        border-radius: 16px;
        border: 1px solid #f0c9ce;
        background: #fff3f4;
        color: #9f2433;
        font-size: 0.9rem;
      }

      .error-banner .material-symbols-outlined {
        font-size: 18px;
      }

      .submit-button {
        min-height: 58px;
        border: 0;
        border-radius: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #188db4, #1780bb);
        color: #ffffff;
        font-size: 1.05rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 18px 32px rgba(23, 128, 187, 0.18);
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          opacity 0.16s ease;
      }

      .submit-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 22px 36px rgba(23, 128, 187, 0.24);
      }

      .submit-button:disabled {
        opacity: 0.72;
        cursor: not-allowed;
      }

      .divider {
        position: relative;
        text-align: center;
        color: #8b99a7;
        font-size: 0.95rem;
      }

      .divider::before,
      .divider::after {
        content: '';
        position: absolute;
        top: 50%;
        width: calc(50% - 28px);
        height: 1px;
        background: #d7e1ea;
      }

      .divider::before {
        left: 0;
      }

      .divider::after {
        right: 0;
      }

      .divider span {
        position: relative;
        background: #ffffff;
        padding: 0 0.85rem;
      }

      .secondary-button {
        min-height: 58px;
        border-radius: 16px;
        border: 1px solid #1791bb;
        background: #ffffff;
        color: #1782b0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.7rem;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.16s ease, transform 0.16s ease;
      }

      .secondary-button:hover {
        background: #f3fbff;
      }

      .secondary-button:active {
        transform: translateY(1px);
      }

      .login-card__policy {
        margin-top: 1rem;
        color: #7b8ea1;
        font-size: 0.88rem;
        line-height: 1.7;
        text-align: center;
      }

      .login-card__policy-link {
        color: #1b81d3;
        font-weight: 600;
      }

      .login-card__switch {
        margin: 0.6rem 0 0;
        text-align: center;
      }

      .login-card__switch a {
        color: #1b81d3;
        font-weight: 600;
      }

      @media (max-width: 1240px) {
        .login-layout {
          grid-template-columns: 1fr;
          height: auto;
          gap: 1.6rem;
        }

        .login-stage {
          position: relative;
          inset: auto;
          margin: 1rem;
          padding: 1.5rem;
        }

        .login-visual {
          min-height: 620px;
        }

        .login-panel {
          justify-content: flex-start;
        }
      }

      @media (max-width: 860px) {
        .login-shell {
          padding: 0.4rem;
        }

        .login-stage {
          margin: 0.4rem;
          padding: 1.1rem;
          border-radius: 24px;
        }

        .login-brand__text {
          font-size: 1.6rem;
        }

        .login-visual {
          min-height: 0;
        }

        .login-visual::before,
        .login-visual__heart,
        .login-visual__calendar,
        .login-visual__shield,
        .login-highlights {
          display: none;
        }

        .login-visual__media {
          position: relative;
          top: auto;
          left: auto;
          width: 100%;
          border-radius: 26px;
        }

        .login-card {
          width: 100%;
          padding: 1.4rem 1.1rem 1.2rem;
        }

        .login-card h1 {
          font-size: 2.9rem;
        }

        .login-form__row {
          flex-direction: column;
          align-items: flex-start;
        }

        .secondary-button,
        .submit-button {
          width: 100%;
        }
      }
    `
  ]
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApiService = inject(AuthApiService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  errorMessage = '';
  isSubmitting = false;
  showPassword = false;
  rememberMe = false;
  readonly audience: 'staff' | 'patient' =
    this.route.snapshot.data['audience'] === 'staff' ? 'staff' : 'patient';

  readonly loginForm = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

    this.authApiService.login(this.loginForm.getRawValue()).subscribe({
      next: (response) => {
        const role = String(response.data.user.role || '').toUpperCase();
        if (!this.isAudienceAllowed(role)) {
          this.tokenService.clearSession();
          this.errorMessage =
            this.audience === 'staff'
              ? 'Tài khoản bệnh nhân không thể đăng nhập tại cổng nhân viên.'
              : 'Tài khoản nhân viên không thể đăng nhập tại cổng bệnh nhân.';
          return;
        }

        this.tokenService.setSession(response.data);
        if (this.audience === 'staff' && this.tokenService.mustChangePassword()) {
          void this.router.navigateByUrl('/staff/change-password');
          return;
        }

        const roleHomePath = this.tokenService.getRoleHomePath() ?? '/access-denied';
        void this.router.navigateByUrl(this.resolvePostLoginTarget(roleHomePath));
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage = error.error?.message ?? 'Đăng nhập thất bại';
        this.isSubmitting = false;
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  onSecondaryAction(): void {
    void this.router.navigateByUrl('/register');
  }

  private isAudienceAllowed(role: string): boolean {
    if (this.audience === 'patient') {
      return role === 'PATIENT';
    }

    return role === 'ADMIN' || role === 'RECEPTIONIST' || role === 'DOCTOR';
  }

  private resolvePostLoginTarget(defaultPath: string): string {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    if (!redirect || !redirect.startsWith('/')) {
      return this.audience === 'patient' ? '/' : defaultPath;
    }

    const expectedPrefix = this.audience === 'staff' ? '/staff/' : '/patient/';
    return redirect.startsWith(expectedPrefix) ? redirect : defaultPath;
  }
}
