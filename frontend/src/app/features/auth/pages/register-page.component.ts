import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthApiService } from '../services/auth.api';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="register-shell">
      <div class="register-card">
        <header class="register-header">
          <p class="register-kicker">Đăng ký tài khoản bệnh nhân</p>
          <h1>Tạo tài khoản để đặt lịch khám trực tuyến</h1>
          <p class="register-subtitle">
            Hệ thống cần xác thực số điện thoại trước khi tạo tài khoản mới để đảm bảo thông tin liên hệ và nhắc lịch chính xác.
          </p>

          <div class="stepper" aria-label="Các bước đăng ký tài khoản">
            <div class="step" [class.step--active]="!isOtpVerified" [class.step--done]="isOtpVerified">
              <span class="step-index">{{ isOtpVerified ? '✓' : '1' }}</span>
              <div>
                <p class="step-label">Bước 1</p>
                <strong>Xác thực số điện thoại</strong>
              </div>
            </div>
            <div class="step" [class.step--active]="isOtpVerified">
              <span class="step-index">2</span>
              <div>
                <p class="step-label">Bước 2</p>
                <strong>Hoàn tất hồ sơ tài khoản</strong>
              </div>
            </div>
          </div>
        </header>

        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="register-form">
          <section class="form-section otp-section">
            <div class="section-header">
              <div>
                <p class="section-kicker">Bước 1</p>
                <h2>Xác thực OTP</h2>
                <p class="section-description">
                  Nhập số điện thoại bệnh nhân để nhận mã OTP. Mã có hiệu lực trong thời gian ngắn và chỉ dùng cho lần đăng ký này.
                </p>
              </div>
              <span class="status-chip" [class.status-chip--success]="isOtpVerified">
                {{ isOtpVerified ? 'Đã xác thực' : 'Chưa xác thực' }}
              </span>
            </div>

            <div class="field-grid field-grid--otp">
              <label class="field field--wide">
                <span>Số điện thoại</span>
                <input
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  formControlName="phone"
                  placeholder="Ví dụ: 0901234567"
                  [disabled]="isSubmitting"
                  (input)="onPhoneInput()"
                />
                <small *ngIf="phoneControl.touched && phoneControl.hasError('required')" class="field-error">
                  Vui lòng nhập số điện thoại
                </small>
              </label>

              <button
                type="button"
                class="button-secondary action-button"
                (click)="sendOtp()"
                [disabled]="isSubmitting || isSendingOtp || !phoneControl.value.trim()"
              >
                {{ isSendingOtp ? 'Đang gửi OTP...' : 'Gửi OTP' }}
              </button>

              <label class="field field--wide">
                <span>Mã OTP</span>
                <input
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  autocomplete="one-time-code"
                  formControlName="otp_code"
                  placeholder="Nhập 6 chữ số OTP"
                  [disabled]="isSubmitting"
                  (input)="onOtpCodeInput()"
                />
                <small *ngIf="otpCodeControl.touched && otpCodeControl.hasError('required')" class="field-error">
                  Vui lòng nhập mã OTP
                </small>
                <small *ngIf="otpCodeControl.touched && otpCodeControl.hasError('minlength')" class="field-error">
                  Mã OTP phải gồm 6 chữ số
                </small>
              </label>

              <button
                type="button"
                class="button-secondary action-button"
                (click)="verifyOtp()"
                [disabled]="isSubmitting || isVerifyingOtp || !phoneControl.value.trim() || !otpCodeControl.value.trim()"
              >
                {{ isVerifyingOtp ? 'Đang xác thực...' : 'Xác thực OTP' }}
              </button>
            </div>

            <div class="otp-info-card">
              <p class="otp-info-title">Lưu ý xác thực</p>
              <p class="otp-info-text">
                {{ otpDeliveryMessage || 'Sau khi nhận OTP, vui lòng nhập đúng 6 chữ số để mở bước tạo tài khoản.' }}
              </p>
            </div>

            <p *ngIf="otpErrorMessage" class="message message-error">{{ otpErrorMessage }}</p>
            <p *ngIf="otpSuccessMessage" class="message message-success">{{ otpSuccessMessage }}</p>
          </section>

          <section class="form-section account-section" [class.account-section--locked]="!canShowAccountSetup">
            <div class="section-header">
              <div>
                <p class="section-kicker">Bước 2</p>
                <h2>Thông tin tài khoản</h2>
                <p class="section-description">
                  Điền đầy đủ thông tin để bệnh nhân có thể đăng nhập, theo dõi lịch hẹn và nhận thông báo từ bệnh viện.
                </p>
              </div>
            </div>

            <p *ngIf="!canShowAccountSetup" class="section-blocked-note">
              Hoàn tất bước xác thực OTP để mở phần thông tin tài khoản.
            </p>

            <div class="field-grid">
              <label class="field">
                <span>Họ và tên</span>
                <input
                  type="text"
                  autocomplete="name"
                  formControlName="fullname"
                  placeholder="Nhập họ và tên bệnh nhân"
                  [disabled]="isSubmitting || !canShowAccountSetup"
                />
                <small *ngIf="registerForm.controls.fullname.touched && registerForm.controls.fullname.hasError('required')" class="field-error">
                  Vui lòng nhập họ và tên
                </small>
              </label>

              <label class="field">
                <span>Tên đăng nhập</span>
                <input
                  type="text"
                  autocomplete="username"
                  formControlName="username"
                  placeholder="Nhập tên đăng nhập"
                  [disabled]="isSubmitting || !canShowAccountSetup"
                />
                <small *ngIf="registerForm.controls.username.touched && registerForm.controls.username.hasError('required')" class="field-error">
                  Vui lòng nhập tên đăng nhập
                </small>
              </label>

              <label class="field">
                <span>Email</span>
                <input
                  type="email"
                  autocomplete="email"
                  formControlName="email"
                  placeholder="you@example.com"
                  [disabled]="isSubmitting || !canShowAccountSetup"
                />
              </label>

              <label class="field">
                <span>Mật khẩu</span>
                <input
                  type="password"
                  autocomplete="new-password"
                  formControlName="password"
                  placeholder="Tối thiểu 6 ký tự"
                  [disabled]="isSubmitting || !canShowAccountSetup"
                />
                <small *ngIf="registerForm.controls.password.touched && registerForm.controls.password.hasError('required')" class="field-error">
                  Vui lòng nhập mật khẩu
                </small>
                <small *ngIf="registerForm.controls.password.touched && registerForm.controls.password.hasError('minlength')" class="field-error">
                  Mật khẩu phải có ít nhất 6 ký tự
                </small>
              </label>
            </div>
          </section>

          <p *ngIf="errorMessage" class="message message-error">{{ errorMessage }}</p>
          <p *ngIf="successMessage" class="message message-success">{{ successMessage }}</p>

          <div class="form-footer">
            <button type="submit" [disabled]="isSubmitting || !isOtpVerified">
              {{ isSubmitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký' }}
            </button>
            <p class="footer-note">Bằng việc đăng ký, bệnh nhân có thể đặt lịch và quản lý lịch khám trực tuyến.</p>
          </div>
        </form>

        <div class="register-actions">
          <a routerLink="/login">Đã có tài khoản? Đăng nhập</a>
          <a routerLink="/">Quay lại trang bệnh viện</a>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(22, 142, 183, 0.12), transparent 34%),
          linear-gradient(180deg, #eef5fb 0%, #f7fbff 100%);
      }

      .register-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }

      .register-card {
        width: min(100%, 760px);
        padding: 1.75rem;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #d7e4ef;
        box-shadow: 0 24px 60px rgba(22, 66, 99, 0.14);
      }

      .register-header {
        display: grid;
        gap: 1rem;
      }

      .register-kicker,
      .section-kicker,
      .step-label {
        margin: 0;
        color: #1684ab;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        color: #14395a;
        font-size: clamp(1.9rem, 3vw, 2.5rem);
        line-height: 1.12;
      }

      .register-subtitle {
        margin: 0;
        color: #607a92;
        line-height: 1.7;
        max-width: 62ch;
      }

      .stepper {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.9rem;
      }

      .step {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.95rem 1rem;
        border-radius: 18px;
        border: 1px solid #d8e3ee;
        background: #f8fbfe;
        color: #607a92;
      }

      .step strong {
        display: block;
        color: #23415c;
        font-size: 0.98rem;
      }

      .step-index {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        background: #dbe8f4;
        color: #23415c;
        font-weight: 700;
        flex: 0 0 auto;
      }

      .step--active {
        border-color: #93c5dc;
        background: #eff8fc;
      }

      .step--done {
        border-color: #b9e2d0;
        background: #f1fbf6;
      }

      .step--done .step-index {
        background: #1f8f5f;
        color: #fff;
      }

      .register-form {
        display: grid;
        gap: 1rem;
        margin-top: 1.5rem;
      }

      .form-section {
        display: grid;
        gap: 1rem;
        padding: 1.1rem;
        border-radius: 22px;
        border: 1px solid #d9e5ef;
        background: #fbfdff;
      }

      .otp-section {
        background: linear-gradient(180deg, #f8fcff 0%, #fefefe 100%);
      }

      .account-section--locked {
        opacity: 0.72;
      }

      .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }

      .section-header h2 {
        margin: 0.2rem 0 0;
        color: #163b5c;
        font-size: 1.2rem;
      }

      .section-description {
        margin: 0.45rem 0 0;
        color: #607a92;
        line-height: 1.65;
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        padding: 0.35rem 0.8rem;
        border-radius: 999px;
        border: 1px solid #d4e0ea;
        background: #f5f8fb;
        color: #4f6b84;
        font-size: 0.85rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .status-chip--success {
        border-color: #b9e2d0;
        background: #eefbf4;
        color: #17633a;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.95rem;
      }

      .field-grid--otp {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
      }

      .field,
      .field--wide {
        display: grid;
        gap: 0.42rem;
      }

      .field--wide {
        grid-column: 1 / 2;
      }

      .field span {
        color: #20324e;
        font-size: 0.84rem;
        font-weight: 700;
      }

      input {
        min-height: 50px;
        border-radius: 14px;
        border: 1px solid #cfdbe7;
        padding: 0 0.9rem;
        font: inherit;
        color: #1d2f46;
        background: #fff;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
      }

      input:focus {
        outline: none;
        border-color: #1791bb;
        box-shadow: 0 0 0 4px rgba(23, 145, 187, 0.12);
      }

      input:disabled {
        background: #f3f6f9;
        color: #8aa0b5;
        cursor: not-allowed;
      }

      input[formcontrolname='otp_code'] {
        letter-spacing: 0.28em;
        font-weight: 700;
      }

      button {
        min-height: 52px;
        border: 0;
        border-radius: 14px;
        background: linear-gradient(135deg, #188db4, #177db7);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .button-secondary {
        background: #fff;
        color: #1b6da7;
        border: 1px solid #c8d9e8;
      }

      .action-button {
        min-width: 168px;
      }

      button:disabled {
        opacity: 0.72;
        cursor: not-allowed;
      }

      .otp-info-card {
        padding: 0.9rem 1rem;
        border-radius: 16px;
        background: #f2f8fc;
        border: 1px solid #d7e7f2;
      }

      .otp-info-title {
        margin: 0;
        color: #1a5375;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .otp-info-text {
        margin: 0.35rem 0 0;
        color: #607a92;
        line-height: 1.6;
      }

      .section-blocked-note {
        margin: 0;
        padding: 0.9rem 1rem;
        border-radius: 16px;
        background: #fff7ed;
        border: 1px solid #fed7aa;
        color: #9a4b14;
      }

      .message {
        margin: 0;
        padding: 0.9rem 1rem;
        border-radius: 14px;
        font-size: 0.92rem;
      }

      .message-error {
        background: #fff3f4;
        border: 1px solid #f1cbd1;
        color: #9f2433;
      }

      .message-success {
        background: #eefaf1;
        border: 1px solid #cfe9d4;
        color: #17633a;
      }

      .form-footer {
        display: grid;
        gap: 0.7rem;
      }

      .footer-note {
        margin: 0;
        color: #607a92;
        font-size: 0.9rem;
      }

      .register-actions {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        margin-top: 1.2rem;
        flex-wrap: wrap;
      }

      .register-actions a {
        color: #1b81d3;
        font-weight: 600;
        text-decoration: none;
      }

      .register-actions a:hover {
        text-decoration: underline;
      }

      @media (max-width: 720px) {
        .register-card {
          padding: 1.25rem;
        }

        .stepper,
        .field-grid,
        .field-grid--otp {
          grid-template-columns: 1fr;
        }

        .field--wide {
          grid-column: auto;
        }

        .section-header {
          flex-direction: column;
        }

        .status-chip,
        .action-button {
          width: 100%;
          justify-content: center;
        }

        .register-actions {
          flex-direction: column;
        }
      }
    `
  ]
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApiService = inject(AuthApiService);
  private readonly router = inject(Router);

  isSubmitting = false;
  isSendingOtp = false;
  isVerifyingOtp = false;
  isOtpVerified = false;
  errorMessage = '';
  successMessage = '';
  otpErrorMessage = '';
  otpSuccessMessage = '';
  otpDeliveryMessage = '';
  private verifiedPhone = '';
  private verifiedOtpCode = '';

  readonly registerForm = this.fb.nonNullable.group({
    fullname: ['', [Validators.required]],
    username: ['', [Validators.required]],
    email: [''],
    phone: ['', [Validators.required]],
    otp_code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  get phoneControl() {
    return this.registerForm.controls.phone;
  }

  get otpCodeControl() {
    return this.registerForm.controls.otp_code;
  }

  get canShowAccountSetup(): boolean {
    return this.isOtpVerified;
  }

  onPhoneInput(): void {
    const normalizedPhone = this.normalizePhoneValue(this.phoneControl.value);
    if (!this.isOtpVerified || normalizedPhone === this.verifiedPhone) {
      return;
    }

    this.resetOtpVerificationState();
  }

  onOtpCodeInput(): void {
    if (!this.isOtpVerified) {
      return;
    }

    if (this.otpCodeControl.value.trim() !== this.verifiedOtpCode) {
      this.resetOtpVerificationState();
    }
  }

  sendOtp(): void {
    const phone = this.phoneControl.value.trim();
    if (!phone) {
      this.otpErrorMessage = 'Vui lòng nhập số điện thoại trước khi gửi OTP.';
      return;
    }

    this.isSendingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.resetOtpVerificationState();

    this.authApiService.sendPhoneOtp({
      phone,
      purpose: 'REGISTER'
    }).subscribe({
      next: (response) => {
        this.otpDeliveryMessage = response.data?.expires_at
          ? 'OTP đã được gửi. Vui lòng nhập mã trong vòng 5 phút.'
          : 'OTP đã được gửi tới số điện thoại đã đăng ký.';
      },
      error: (error: { error?: { message?: string } }) => {
        this.otpErrorMessage = error.error?.message ?? 'Không thể gửi OTP.';
      },
      complete: () => {
        this.isSendingOtp = false;
      }
    });
  }

  verifyOtp(): void {
    const phone = this.phoneControl.value.trim();
    const code = this.otpCodeControl.value.trim();

    if (!phone || !code) {
      this.otpErrorMessage = 'Vui lòng nhập số điện thoại và mã OTP.';
      return;
    }

    this.isVerifyingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';

    this.authApiService.verifyPhoneOtp({
      phone,
      code,
      purpose: 'REGISTER'
    }).subscribe({
      next: () => {
        this.isOtpVerified = true;
        this.verifiedPhone = this.normalizePhoneValue(phone);
        this.verifiedOtpCode = code;
        this.otpSuccessMessage = 'Số điện thoại đã được xác thực. Bạn có thể tiếp tục tạo tài khoản.';
      },
      error: (error: { error?: { message?: string } }) => {
        this.resetOtpVerificationState();
        this.otpErrorMessage = error.error?.message ?? 'Không thể xác thực OTP.';
      },
      complete: () => {
        this.isVerifyingOtp = false;
      }
    });
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const phone = this.phoneControl.value.trim();
    const otpCode = this.otpCodeControl.value.trim();
    const normalizedPhone = this.normalizePhoneValue(phone);

    if (!this.isOtpVerified || normalizedPhone !== this.verifiedPhone || otpCode !== this.verifiedOtpCode) {
      this.errorMessage = 'Vui lòng gửi và xác thực OTP hợp lệ trước khi đăng ký.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authApiService.register({
      ...this.registerForm.getRawValue(),
      phone,
      otp_code: otpCode
    }).subscribe({
      next: () => {
        this.successMessage = 'Tạo tài khoản thành công. Hệ thống sẽ chuyển sang màn đăng nhập.';
        setTimeout(() => {
          void this.router.navigateByUrl('/login');
        }, 1000);
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage = error.error?.message ?? 'Không thể tạo tài khoản';
        this.isSubmitting = false;
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  private resetOtpVerificationState(): void {
    this.isOtpVerified = false;
    this.verifiedPhone = '';
    this.verifiedOtpCode = '';
    this.otpSuccessMessage = '';
  }

  private normalizePhoneValue(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('84') && digits.length === 11) {
      return `0${digits.slice(2)}`;
    }

    return digits;
  }
}
