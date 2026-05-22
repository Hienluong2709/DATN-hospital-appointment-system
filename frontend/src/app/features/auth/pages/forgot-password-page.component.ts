import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthApiService } from '../services/auth.api';

const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="reset-page">
      <header class="reset-header">
        <a routerLink="/" class="brand" aria-label="Trang chủ Hospital System">
          <span class="brand-mark material-symbols-outlined">health_and_safety</span>
          <span>
            <strong>Hospital System</strong>
            <small>Digital Clinic Platform</small>
          </span>
        </a>
        <nav>
          <a routerLink="/login">Đăng nhập</a>
          <a routerLink="/register" class="primary-link">Đăng ký</a>
        </nav>
      </header>

      <main class="reset-main">
        <section class="reset-card">
          <div class="steps" aria-label="Tiến trình đặt lại mật khẩu">
            <span [class.active]="step === 1" [class.done]="step > 1">1</span>
            <i></i>
            <span [class.active]="step === 2" [class.done]="step > 2">2</span>
            <i></i>
            <span [class.active]="step === 3">3</span>
          </div>

          <p class="kicker">Tài khoản bệnh nhân</p>
          <h1>Quên mật khẩu</h1>
          <p class="subtitle">
            Nhập email đã đăng ký để nhận mã OTP và tạo mật khẩu mới cho tài khoản bệnh nhân.
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="reset-form">
            <label class="field">
              <span>Email <b>*</b></span>
              <input
                type="email"
                autocomplete="email"
                formControlName="email"
                placeholder="Nhập email tài khoản bệnh nhân"
                [readonly]="step > 1"
              />
              <small *ngIf="form.controls.email.touched && form.controls.email.hasError('required')">Vui lòng nhập email</small>
              <small *ngIf="form.controls.email.touched && form.controls.email.hasError('email')">Email không hợp lệ</small>
            </label>

            <ng-container *ngIf="step >= 2">
              <div class="otp-note">
                <span class="material-symbols-outlined">mark_email_read</span>
                <p>Mã OTP đã được gửi đến <strong>{{ normalizedEmail }}</strong>.</p>
              </div>

              <label class="field">
                <span>Mã OTP <b>*</b></span>
                <input
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  autocomplete="one-time-code"
                  formControlName="otpCode"
                  placeholder="Nhập 6 chữ số OTP"
                  [readonly]="isOtpVerified"
                />
                <small *ngIf="form.controls.otpCode.touched && form.controls.otpCode.invalid">Mã OTP phải gồm 6 chữ số</small>
              </label>
            </ng-container>

            <ng-container *ngIf="step === 3">
              <label class="field">
                <span>Mật khẩu mới <b>*</b></span>
                <input type="password" autocomplete="new-password" formControlName="newPassword" placeholder="Ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt" />
                <small *ngIf="form.controls.newPassword.touched && form.controls.newPassword.hasError('required')">Vui lòng nhập mật khẩu mới</small>
                <small *ngIf="form.controls.newPassword.touched && form.controls.newPassword.hasError('pattern')">Mật khẩu chưa đáp ứng yêu cầu bảo mật</small>
              </label>

              <label class="field">
                <span>Xác nhận mật khẩu <b>*</b></span>
                <input type="password" autocomplete="new-password" formControlName="confirmPassword" placeholder="Nhập lại mật khẩu mới" />
                <small *ngIf="form.controls.confirmPassword.touched && form.controls.confirmPassword.hasError('required')">Vui lòng xác nhận mật khẩu</small>
                <small *ngIf="form.controls.confirmPassword.touched && passwordMismatch">Xác nhận mật khẩu không khớp</small>
              </label>
            </ng-container>

            <p *ngIf="errorMessage" class="message error">{{ errorMessage }}</p>
            <p *ngIf="successMessage" class="message success">{{ successMessage }}</p>

            <button type="submit" class="submit-button" [disabled]="isSubmitting">
              {{ submitLabel }}
            </button>

            <div class="actions">
              <button type="button" *ngIf="step >= 2" (click)="sendOtp()" [disabled]="isSubmitting">Gửi lại OTP</button>
              <a routerLink="/login">Quay lại đăng nhập</a>
            </div>
          </form>
        </section>
      </main>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        color: #12395d;
        background: linear-gradient(180deg, #eaf5ff 0%, #f7fbff 54%, #eef7ff 100%);
      }

      .reset-header {
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.5rem;
        border-bottom: 1px solid #cfe3f4;
        background: rgba(255, 255, 255, 0.92);
      }

      .brand,
      .reset-header nav {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .brand {
        color: #0f3a62;
        text-decoration: none;
      }

      .brand-mark {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #0b63b6;
        background: #e7f3ff;
        font-size: 21px;
      }

      .brand strong,
      .brand small {
        display: block;
      }

      .brand small {
        color: #54708b;
        font-size: 0.78rem;
      }

      .reset-header a {
        color: #0f4f85;
        font-weight: 700;
        text-decoration: none;
      }

      .primary-link {
        padding: 0.65rem 1rem;
        border-radius: 8px;
        color: #ffffff !important;
        background: #0f5f9f;
      }

      .reset-main {
        min-height: calc(100vh - 64px);
        display: grid;
        place-items: center;
        padding: 2rem 1rem;
      }

      .reset-card {
        width: min(100%, 720px);
        padding: 2rem;
        border: 1px solid #c8ddf0;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 22px 55px rgba(19, 65, 103, 0.11);
      }

      .steps {
        display: grid;
        grid-template-columns: 36px 1fr 36px 1fr 36px;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .steps span {
        height: 36px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #b8d0e7;
        color: #52708b;
        font-weight: 800;
      }

      .steps span.active,
      .steps span.done {
        color: #ffffff;
        border-color: #0f5f9f;
        background: #0f5f9f;
      }

      .steps i {
        height: 2px;
        background: #c8ddf0;
      }

      .kicker {
        margin: 0 0 0.45rem;
        color: #0f5f9f;
        font-size: 0.78rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: 2rem;
        color: #12395d;
      }

      .subtitle {
        margin: 0.7rem 0 1.5rem;
        color: #526c85;
        line-height: 1.6;
      }

      .reset-form,
      .field {
        display: grid;
        gap: 0.65rem;
      }

      .reset-form {
        gap: 1rem;
      }

      .field span {
        font-weight: 800;
      }

      .field b,
      .field small {
        color: #dc2626;
      }

      input {
        min-height: 48px;
        border: 1px solid #bcd3e9;
        border-radius: 8px;
        padding: 0 0.9rem;
        color: #12395d;
        font: inherit;
        background: #ffffff;
      }

      input:focus {
        outline: none;
        border-color: #0f5f9f;
        box-shadow: 0 0 0 3px rgba(15, 95, 159, 0.13);
      }

      input[readonly] {
        background: #f3f8fd;
      }

      .otp-note {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.9rem 1rem;
        border-radius: 10px;
        background: #eaf5ff;
        color: #315a7c;
      }

      .otp-note p {
        margin: 0;
      }

      .otp-note .material-symbols-outlined {
        color: #0f5f9f;
      }

      .message {
        margin: 0;
        padding: 0.85rem 0.95rem;
        border-radius: 8px;
        font-weight: 700;
      }

      .error {
        color: #b91c1c;
        background: #fff1f2;
        border: 1px solid #fecdd3;
      }

      .success {
        color: #047857;
        background: #ecfdf5;
        border: 1px solid #bbf7d0;
      }

      .submit-button {
        min-height: 50px;
        border: 0;
        border-radius: 8px;
        color: #ffffff;
        background: #0f5f9f;
        font-weight: 800;
        cursor: pointer;
      }

      .submit-button:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }

      .actions {
        display: flex;
        justify-content: center;
        gap: 1.2rem;
      }

      .actions button,
      .actions a {
        border: 0;
        background: transparent;
        color: #0b63b6;
        font: inherit;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
      }

      @media (max-width: 640px) {
        .reset-header {
          padding: 0 1rem;
        }

        .brand small {
          display: none;
        }

        .reset-card {
          padding: 1.2rem;
        }
      }
    `,
  ],
})
export class ForgotPasswordPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApiService = inject(AuthApiService);

  step: 1 | 2 | 3 = 1;
  isSubmitting = false;
  isOtpVerified = false;
  errorMessage = '';
  successMessage = '';

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    otpCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required]],
  });

  get normalizedEmail(): string {
    return this.form.controls.email.value.trim().toLowerCase();
  }

  get passwordMismatch(): boolean {
    return this.form.controls.newPassword.value !== this.form.controls.confirmPassword.value;
  }

  get submitLabel(): string {
    if (this.isSubmitting) {
      return this.step === 1 ? 'Đang gửi OTP...' : this.step === 2 ? 'Đang xác thực...' : 'Đang đặt lại mật khẩu...';
    }

    return this.step === 1 ? 'Gửi OTP xác thực' : this.step === 2 ? 'Xác thực OTP' : 'Đặt lại mật khẩu';
  }

  submit(): void {
    if (this.step === 1) {
      this.sendOtp();
      return;
    }

    if (this.step === 2) {
      this.verifyOtp();
      return;
    }

    this.resetPassword();
  }

  sendOtp(): void {
    this.form.controls.email.markAsTouched();
    if (this.form.controls.email.invalid) {
      this.errorMessage = 'Vui lòng nhập email hợp lệ.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.isOtpVerified = false;

    this.authApiService.sendForgotPasswordOtp(this.normalizedEmail).subscribe({
      next: () => {
        this.step = 2;
        this.form.controls.otpCode.reset();
        this.successMessage = 'OTP đã được gửi tới email của bạn.';
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage = error.error?.message ?? 'Không thể gửi OTP đặt lại mật khẩu.';
      },
      complete: () => {
        this.isSubmitting = false;
      },
    });
  }

  verifyOtp(): void {
    this.form.controls.otpCode.markAsTouched();
    if (this.form.controls.otpCode.invalid) {
      this.errorMessage = 'Vui lòng nhập mã OTP gồm 6 chữ số.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authApiService.verifyForgotPasswordOtp(this.normalizedEmail, this.form.controls.otpCode.value.trim()).subscribe({
      next: () => {
        this.isOtpVerified = true;
        this.step = 3;
        this.successMessage = 'OTP hợp lệ. Vui lòng tạo mật khẩu mới.';
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage = error.error?.message ?? 'Không thể xác thực OTP.';
      },
      complete: () => {
        this.isSubmitting = false;
      },
    });
  }

  resetPassword(): void {
    this.form.controls.newPassword.markAsTouched();
    this.form.controls.confirmPassword.markAsTouched();

    if (this.form.controls.newPassword.invalid || this.form.controls.confirmPassword.invalid || this.passwordMismatch) {
      this.errorMessage = 'Vui lòng nhập mật khẩu mới hợp lệ và khớp xác nhận.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authApiService.resetForgottenPassword({
      email: this.normalizedEmail,
      otpCode: this.form.controls.otpCode.value.trim(),
      newPassword: this.form.controls.newPassword.value,
      confirmPassword: this.form.controls.confirmPassword.value,
    }).subscribe({
      next: () => {
        this.successMessage = 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.';
        this.form.controls.newPassword.reset();
        this.form.controls.confirmPassword.reset();
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage = error.error?.message ?? 'Không thể đặt lại mật khẩu.';
      },
      complete: () => {
        this.isSubmitting = false;
      },
    });
  }
}
