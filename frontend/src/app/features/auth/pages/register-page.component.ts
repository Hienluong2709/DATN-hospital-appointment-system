import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthApiService } from '../services/auth.api';

const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="register-page">
      <header class="public-header">
        <div class="public-header__inner">
          <a routerLink="/" class="brand">
            <span class="brand-mark material-symbols-outlined">health_and_safety</span>
            <span>
              <strong>Hospital System</strong>
              <small>Digital Clinic Platform</small>
            </span>
          </a>

          <div class="header-actions">
            <a routerLink="/login" class="header-link">Đăng nhập</a>
            <a routerLink="/register" class="header-primary">Đăng ký</a>
          </div>
        </div>
      </header>

      <main class="register-main">
        <section class="register-card">
          <ng-container *ngIf="!registrationCompleted; else successTemplate">
            <div class="card-brand">
              <span class="brand-mark material-symbols-outlined">health_and_safety</span>
              <span>
                <strong>Hospital System</strong>
                <small>Hệ thống đặt lịch khám bệnh</small>
              </span>
            </div>

            <div class="stepper" aria-label="Các bước đăng ký">
              <div class="step" [class.step--done]="isOtpSent" [class.step--active]="!isOtpSent">
                <span>{{ isOtpSent ? '✓' : '1' }}</span>
                <p>Thông tin đăng ký</p>
              </div>
              <div class="step-line" [class.step-line--active]="isOtpSent"></div>
              <div class="step" [class.step--done]="isOtpVerified" [class.step--active]="isOtpSent && !isOtpVerified">
                <span>{{ isOtpVerified ? '✓' : '2' }}</span>
                <p>Xác thực email</p>
              </div>
              <div class="step-line" [class.step-line--active]="isOtpVerified"></div>
              <div class="step" [class.step--active]="isOtpVerified">
                <span>3</span>
                <p>Hoàn tất</p>
              </div>
            </div>

            <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="register-form">
              <section *ngIf="!isOtpSent || !isOtpVerified" class="form-panel">
                <header class="panel-header">
                  <p>{{ isOtpSent ? 'Bước 2' : 'Bước 1' }}</p>
                  <h2>{{ isOtpSent ? 'Xác thực email' : 'Thông tin đăng ký' }}</h2>
                </header>

                <ng-container *ngIf="!isOtpSent; else otpTemplate">
                  <div class="field-grid">
                    <label class="field">
                      <span>Họ và tên <b>*</b></span>
                      <input type="text" autocomplete="name" formControlName="fullname" placeholder="Nhập họ và tên" (input)="onAccountInput()" />
                      <small *ngIf="registerForm.controls.fullname.touched && registerForm.controls.fullname.hasError('required')">Vui lòng nhập họ và tên</small>
                    </label>

                    <label class="field">
                      <span>Tên đăng nhập <b>*</b></span>
                      <input type="text" autocomplete="username" formControlName="username" placeholder="Nhập tên đăng nhập" (input)="onAccountInput()" />
                      <small *ngIf="registerForm.controls.username.touched && registerForm.controls.username.hasError('required')">Vui lòng nhập tên đăng nhập</small>
                    </label>

                    <label class="field">
                      <span>Email <b>*</b></span>
                      <input type="email" autocomplete="email" formControlName="email" placeholder="Nhập email của bạn" (input)="onEmailInput()" />
                      <small *ngIf="emailControl.touched && emailControl.hasError('required')">Vui lòng nhập email</small>
                      <small *ngIf="emailControl.touched && emailControl.hasError('email')">Email không hợp lệ</small>
                    </label>

                    <label class="field">
                      <span>Số điện thoại</span>
                      <input type="tel" inputmode="numeric" autocomplete="tel" formControlName="phone" placeholder="Nhập số điện thoại" />
                    </label>

                    <label class="field field--wide">
                      <span>Mật khẩu <b>*</b></span>
                      <input type="password" autocomplete="new-password" formControlName="password" placeholder="Ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt" (input)="onAccountInput()" />
                      <small *ngIf="registerForm.controls.password.touched && registerForm.controls.password.hasError('required')">Vui lòng nhập mật khẩu</small>
                      <small *ngIf="registerForm.controls.password.touched && registerForm.controls.password.hasError('pattern')">Mật khẩu chưa đáp ứng yêu cầu bảo mật</small>
                    </label>

                    <label class="field field--wide">
                      <span>Xác nhận mật khẩu <b>*</b></span>
                      <input type="password" autocomplete="new-password" formControlName="confirm_password" placeholder="Nhập lại mật khẩu" (input)="onAccountInput()" />
                      <small *ngIf="registerForm.controls.confirm_password.touched && registerForm.controls.confirm_password.hasError('required')">Vui lòng xác nhận mật khẩu</small>
                      <small *ngIf="registerForm.controls.confirm_password.touched && passwordMismatch">Xác nhận mật khẩu không khớp</small>
                    </label>
                  </div>

                  <label class="terms-row">
                    <input type="checkbox" [checked]="acceptedTerms" (change)="acceptedTerms = $any($event.target).checked" />
                    <span>Tôi đồng ý với <a routerLink="/">Điều khoản sử dụng</a> và <a routerLink="/">Chính sách bảo mật</a></span>
                  </label>

                  <button type="button" class="btn btn-primary btn-block" (click)="sendOtp()" [disabled]="isSendingOtp || !canSendOtp || !acceptedTerms">
                    {{ isSendingOtp ? 'Đang gửi OTP...' : 'Tiếp tục' }}
                  </button>
                </ng-container>

                <ng-template #otpTemplate>
                  <div class="otp-hero">
                    <span class="material-symbols-outlined">mark_email_read</span>
                    <h3>Xác thực email</h3>
                    <p>Mã OTP đã được gửi đến địa chỉ email của bạn:</p>
                    <strong>{{ emailControl.value }}</strong>
                  </div>

                  <label class="field otp-field">
                    <span>Mã OTP <b>*</b></span>
                    <input type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" formControlName="otp_code" placeholder="Nhập 6 chữ số OTP" [disabled]="isOtpVerified" (input)="onOtpCodeInput()" />
                    <small *ngIf="otpCodeControl.touched && otpCodeControl.invalid">Mã OTP phải gồm 6 chữ số</small>
                  </label>

                  <button type="button" class="btn btn-primary btn-block" (click)="verifyOtp()" [disabled]="isVerifyingOtp || isOtpVerified || !otpCodeControl.value.trim()">
                    {{ isVerifyingOtp ? 'Đang xác thực...' : 'Xác thực tài khoản' }}
                  </button>

                  <div class="otp-actions">
                    <button type="button" class="link-button" (click)="resetOtpVerificationState()">Quay lại chỉnh sửa thông tin</button>
                    <button type="button" class="link-button" (click)="sendOtp()" [disabled]="isSendingOtp">Gửi lại OTP</button>
                  </div>
                </ng-template>
              </section>

              <section *ngIf="isOtpVerified" class="verified-panel">
                <span class="material-symbols-outlined">verified</span>
                <h2>Email đã được xác thực</h2>
                <p>Tài khoản đã sẵn sàng để tạo. Vui lòng hoàn tất bước cuối.</p>
                <button type="submit" class="btn btn-primary btn-block" [disabled]="isSubmitting">
                  {{ isSubmitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký' }}
                </button>
              </section>

              <p *ngIf="otpErrorMessage" class="message message-error">{{ otpErrorMessage }}</p>
              <p *ngIf="otpSuccessMessage" class="message message-success">{{ otpSuccessMessage }}</p>
              <p *ngIf="errorMessage" class="message message-error">{{ errorMessage }}</p>
              <p *ngIf="successMessage" class="message message-success">{{ successMessage }}</p>
            </form>

            <p class="signin-note">Đã có tài khoản? <a routerLink="/login">Đăng nhập ngay</a></p>
          </ng-container>

          <ng-template #successTemplate>
            <div class="success-panel">
              <div class="success-icon">
                <span class="material-symbols-outlined">check</span>
              </div>
              <h2>Đăng ký thành công!</h2>
              <p>Tài khoản bệnh nhân của bạn đã được tạo. Bạn có thể đăng nhập để đặt lịch khám và sử dụng các dịch vụ của hệ thống.</p>

              <div class="account-summary">
                <h3>Thông tin tài khoản</h3>
                <p><span class="material-symbols-outlined">person</span><strong>{{ registerForm.controls.username.value }}</strong></p>
                <p><span class="material-symbols-outlined">mail</span><strong>{{ emailControl.value }}</strong></p>
                <p *ngIf="registerForm.controls.phone.value"><span class="material-symbols-outlined">call</span><strong>{{ registerForm.controls.phone.value }}</strong></p>
              </div>

              <a routerLink="/login" class="btn btn-primary btn-block">Đăng nhập ngay</a>
              <a routerLink="/" class="home-link">Về trang chủ</a>
            </div>
          </ng-template>
        </section>
      </main>

      <footer class="patient-footer">
        <div class="patient-footer__grid">
          <section class="patient-footer__brand">
            <p class="patient-footer__eyebrow">Hospital System</p>
            <h2>Bệnh viện Đa khoa Hien Luong</h2>
            <p>
              Cổng thông tin bệnh nhân hỗ trợ xem thông tin bệnh viện, chuyên khoa, đội ngũ bác sĩ và
              đặt lịch khám thuận tiện trên cùng một nền tảng.
            </p>
          </section>

          <section>
            <h3>Điều hướng nhanh</h3>
            <nav class="patient-footer__links">
              <a routerLink="/login" [queryParams]="{ redirect: '/patient/appointments' }">Đặt lịch khám</a>
              <a routerLink="/">Đội ngũ bác sĩ</a>
              <a routerLink="/">Chuyên khoa</a>
              <a routerLink="/register">Tạo tài khoản bệnh nhân</a>
            </nav>
          </section>

          <section>
            <h3>Liên hệ hỗ trợ</h3>
            <ul class="patient-footer__meta">
              <li>Tổng đài: 1900 6868</li>
              <li>Email: support&#64;luong-hospital.vn</li>
              <li>Địa chỉ: 123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh</li>
              <li>Hỗ trợ: 07:00 - 20:00 mỗi ngày</li>
            </ul>
          </section>
        </div>

        <div class="patient-footer__bottom">
          <span>© 2026 Luong Hospital. All rights reserved.</span>
          <span>Chăm sóc sức khỏe an toàn, minh bạch và thuận tiện cho bệnh nhân.</span>
        </div>
      </footer>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(29, 108, 174, 0.16), transparent 30%),
          radial-gradient(circle at bottom right, rgba(42, 137, 204, 0.1), transparent 35%),
          linear-gradient(180deg, #edf6ff 0%, #f8fbff 45%, #f5f8fc 100%);
        color: #14324a;
      }

      .register-page {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }

      .patient-footer {
        width: 100%;
        margin: 0 auto;
      }

      .public-header {
        min-height: 68px;
        display: flex;
        align-items: center;
        padding: 0 1.1rem;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        border-bottom: 1px solid #dbe7f3;
        box-shadow: rgba(20, 53, 84, 0.08) 0 8px 20px;
      }

      .public-header__inner {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-width: 0;
      }

      .brand,
      .card-brand,
      .footer-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.52rem;
        color: #123a60;
        text-decoration: none;
      }

      .brand strong,
      .card-brand strong,
      .footer-brand strong {
        display: block;
        font-size: 0.86rem;
        font-weight: 800;
        line-height: 1.1;
      }

      .brand small,
      .card-brand small,
      .footer-brand small {
        display: block;
        margin-top: 0.12rem;
        color: #5c7790;
        font-size: 0.68rem;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: #e6f4fb;
        border: 1px solid #d6e6f1;
        color: #1d6cae;
        font-size: 1.05rem;
      }

      .signin-note a,
      .home-link,
      .terms-row a,
      .link-button {
        color: #075fd6;
        font-weight: 700;
        text-decoration: none;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      .header-link,
      .header-primary {
        min-height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.95rem;
        border: 1px solid #d5e4ef;
        border-radius: 10px;
        color: #123a60;
        font-size: 0.82rem;
        font-weight: 800;
        text-decoration: none;
        transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .header-link {
        background: #f8fbff;
      }

      .header-primary {
        border-color: #155286;
        background: linear-gradient(135deg, #0f385f, #1d6cae);
        color: #fff;
      }

      .btn {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0 1.1rem;
        border-radius: 8px;
        border: 1px solid transparent;
        font: inherit;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
      }

      .btn-primary {
        background: linear-gradient(135deg, #0f385f, #1d6cae);
        color: #fff;
        border-color: #155286;
        box-shadow: 0 10px 24px rgba(29, 108, 174, 0.2);
      }

      .btn-outline {
        background: #fff;
        color: #17517d;
        border-color: #d5e1ee;
      }

      .btn-block {
        width: 100%;
      }

      .btn:disabled,
      button:disabled {
        opacity: 0.58;
        cursor: not-allowed;
        box-shadow: none;
      }

      .register-main {
        width: min(100%, 980px);
        margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr;
        padding: 1.5rem;
      }

      .register-card {
        border: 1px solid #dce6f0;
        background: #fff;
        box-shadow: 0 18px 44px rgba(34, 76, 112, 0.08);
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      .register-card {
        display: grid;
        align-content: start;
        gap: 1.35rem;
        padding: 2rem;
        border-radius: 18px;
      }

      .card-brand {
        display: none;
      }

      .stepper {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr auto;
        align-items: start;
        gap: 0.75rem;
        margin-bottom: 0.25rem;
      }

      .step {
        min-width: 7.8rem;
        display: grid;
        justify-items: center;
        gap: 0.55rem;
        color: #4f6277;
        text-align: center;
      }

      .step span {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid #c8d7e5;
        background: #fff;
        color: #354b63;
        font-weight: 800;
      }

      .step p {
        font-size: 0.82rem;
      }

      .step--active span,
      .step--done span {
        border-color: #1d6cae;
        background: #1d6cae;
        color: #fff;
      }

      .step--done span {
        background: #155286;
        border-color: #155286;
      }

      .step-line {
        height: 2px;
        margin-top: 16px;
        background: #d8e3ee;
      }

      .step-line--active {
        background: #1d6cae;
      }

      .register-form,
      .form-panel {
        display: grid;
        gap: 1.1rem;
      }

      .panel-header p {
        color: #17517d;
        font-size: 0.8rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .panel-header h2 {
        margin-top: 0.35rem;
        font-size: 1.35rem;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      .field {
        display: grid;
        gap: 0.45rem;
      }

      .field--wide,
      .otp-field {
        grid-column: 1 / -1;
      }

      .field span,
      .terms-row {
        color: #10243d;
        font-size: 0.88rem;
        font-weight: 800;
      }

      .field b {
        color: #d33b3b;
      }

      input {
        min-height: 46px;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #ccd8e4;
        border-radius: 7px;
        padding: 0 0.9rem;
        background: #fff;
        color: #172d43;
        font: inherit;
      }

      input:focus {
        outline: none;
        border-color: #075fd6;
        box-shadow: 0 0 0 3px rgba(7, 95, 214, 0.12);
      }

      input[formcontrolname='otp_code'] {
        height: 58px;
        text-align: center;
        letter-spacing: 0.45em;
        font-size: 1.4rem;
        font-weight: 800;
      }

      small {
        color: #cc3344;
        font-size: 0.78rem;
      }

      .terms-row {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        color: #3e5368;
        font-weight: 600;
      }

      .terms-row input {
        width: 18px;
        min-height: 18px;
        margin-top: 0.1rem;
      }

      .otp-hero {
        display: grid;
        justify-items: center;
        gap: 0.55rem;
        padding: 1.25rem;
        text-align: center;
      }

      .otp-hero > span {
        display: grid;
        place-items: center;
        width: 78px;
        height: 78px;
        border-radius: 22px;
        background: #eaf3ff;
        color: #1d6cae;
        font-size: 3rem;
      }

      .otp-hero h3 {
        font-size: 1.45rem;
      }

      .otp-hero p {
        color: #50687f;
      }

      .otp-hero strong {
        color: #075fd6;
        font-size: 1.05rem;
      }

      .otp-actions {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        flex-wrap: wrap;
      }

      .link-button {
        border: 0;
        background: transparent;
        font: inherit;
        cursor: pointer;
      }

      .verified-panel,
      .success-panel {
        display: grid;
        justify-items: center;
        gap: 1rem;
        padding: 2rem 1rem;
        text-align: center;
      }

      .verified-panel > span,
      .success-icon {
        display: grid;
        place-items: center;
        width: 86px;
        height: 86px;
        border-radius: 999px;
        background: linear-gradient(135deg, #155286, #1d6cae);
        color: #fff;
      }

      .verified-panel > span,
      .success-icon span {
        font-size: 3.5rem;
      }

      .verified-panel p,
      .success-panel p {
        max-width: 34rem;
        color: #50687f;
        line-height: 1.65;
      }

      .account-summary {
        width: min(100%, 360px);
        display: grid;
        gap: 0.8rem;
        padding: 1rem;
        border: 1px solid #e0e8f0;
        border-radius: 10px;
        background: #fbfdff;
        text-align: left;
      }

      .account-summary h3 {
        font-size: 1rem;
      }

      .account-summary p {
        display: flex;
        align-items: center;
        gap: 0.8rem;
      }

      .account-summary span {
        color: #075fd6;
      }

      .message {
        padding: 0.85rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
      }

      .message-error {
        background: #fff3f4;
        border: 1px solid #f0c7cf;
        color: #992233;
      }

      .message-success {
        background: #f0fbf5;
        border: 1px solid #cbead8;
        color: #16643c;
      }

      .signin-note {
        text-align: center;
        color: #50687f;
      }

      .patient-footer {
        margin-top: 0.45rem;
        border-top: 1px solid rgba(191, 214, 235, 0.85);
        background: linear-gradient(180deg, rgba(244, 250, 255, 0.98) 0%, rgba(236, 246, 252, 0.98) 100%);
        padding: 1.6rem 1.5rem 1.2rem;
      }

      .patient-footer__grid {
        display: grid;
        gap: 1.25rem;
        grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(220px, 1fr));
      }

      .patient-footer__brand h2,
      .patient-footer h3 {
        margin: 0;
        color: #123a60;
      }

      .patient-footer__eyebrow {
        margin: 0 0 0.3rem;
        color: #6d8aa2;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .patient-footer__brand p,
      .patient-footer__meta,
      .patient-footer__bottom {
        color: #5f7f99;
        line-height: 1.6;
      }

      .patient-footer__brand p {
        margin: 0.55rem 0 0;
      }

      .patient-footer__links {
        margin-top: 0.75rem;
        display: grid;
        gap: 0.55rem;
      }

      .patient-footer__links a {
        color: #17517d;
        font-weight: 600;
        text-decoration: none;
      }

      .patient-footer__meta {
        margin: 0.75rem 0 0;
        padding-left: 1rem;
        display: grid;
        gap: 0.45rem;
      }

      .patient-footer__bottom {
        margin-top: 1.25rem;
        padding-top: 0.95rem;
        border-top: 1px solid rgba(198, 220, 239, 0.9);
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.5rem;
        justify-content: space-between;
        font-size: 0.88rem;
      }

      @media (max-width: 1040px) {
        .register-main {
          grid-template-columns: 1fr;
        }

        .register-card {
          min-height: auto;
          border-radius: 8px;
        }

        .card-brand {
          display: inline-flex;
        }
      }

      @media (max-width: 680px) {
        .register-main,
        .patient-footer {
          padding-left: 1rem;
          padding-right: 1rem;
        }

        .public-header {
          min-height: auto;
          padding-left: 1rem;
          padding-right: 1rem;
          padding-top: 1rem;
          padding-bottom: 1rem;
        }

        .public-header__inner {
          align-items: flex-start;
          flex-direction: column;
        }

        .field-grid,
        .patient-footer__grid {
          grid-template-columns: 1fr;
          width: 100%;
        }

        .header-actions {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .header-link,
        .header-primary {
          width: 100%;
        }

        .register-card {
          padding: 1.25rem;
        }

        .stepper {
          grid-template-columns: 1fr;
        }

        .step-line {
          display: none;
        }

        .patient-footer__bottom {
          display: grid;
        }
      }
    `
  ]
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApiService = inject(AuthApiService);

  isSubmitting = false;
  isSendingOtp = false;
  isVerifyingOtp = false;
  isOtpSent = false;
  isOtpVerified = false;
  acceptedTerms = false;
  registrationCompleted = false;
  errorMessage = '';
  successMessage = '';
  otpErrorMessage = '';
  otpSuccessMessage = '';
  otpDeliveryMessage = '';
  private verifiedEmail = '';
  private verifiedOtpCode = '';

  readonly registerForm = this.fb.nonNullable.group({
    fullname: ['', [Validators.required]],
    username: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    otp_code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD_PATTERN)]],
    confirm_password: ['', [Validators.required]]
  });

  get emailControl() {
    return this.registerForm.controls.email;
  }

  get otpCodeControl() {
    return this.registerForm.controls.otp_code;
  }

  get passwordMismatch(): boolean {
    return this.registerForm.controls.password.value !== this.registerForm.controls.confirm_password.value;
  }

  get canSendOtp(): boolean {
    return (
      this.registerForm.controls.fullname.valid &&
      this.registerForm.controls.username.valid &&
      this.emailControl.valid &&
      this.registerForm.controls.password.valid &&
      this.registerForm.controls.confirm_password.valid &&
      !this.passwordMismatch
    );
  }

  onEmailInput(): void {
    const normalizedEmail = this.normalizeEmailValue(this.emailControl.value);
    if (!this.isOtpVerified || normalizedEmail === this.verifiedEmail) {
      return;
    }

    this.resetOtpVerificationState();
  }

  onAccountInput(): void {
    if (!this.isOtpSent && !this.isOtpVerified) {
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
    const email = this.emailControl.value.trim();
    this.markAccountFieldsTouched();
    if (!this.canSendOtp) {
      this.otpErrorMessage = 'Vui lòng nhập đầy đủ thông tin hợp lệ trước khi gửi OTP.';
      return;
    }

    this.isSendingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.resetOtpVerificationState();

    this.authApiService.sendEmailOtp({
      email,
      purpose: 'REGISTER'
    }).subscribe({
      next: (response) => {
        this.isOtpSent = true;
        this.otpDeliveryMessage = response.data?.expires_at
          ? 'OTP đã được gửi. Vui lòng nhập mã trong vòng 5 phút.'
          : 'OTP đã được gửi tới email đã đăng ký.';
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
    const email = this.emailControl.value.trim();
    const code = this.otpCodeControl.value.trim();

    if (!this.isOtpSent || !email || !code) {
      this.otpErrorMessage = 'Vui lòng nhập email và mã OTP.';
      return;
    }

    this.isVerifyingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';

    this.authApiService.verifyEmailOtp({
      email,
      code,
      purpose: 'REGISTER'
    }).subscribe({
      next: () => {
        this.isOtpVerified = true;
        this.verifiedEmail = this.normalizeEmailValue(email);
        this.verifiedOtpCode = code;
        this.otpSuccessMessage = 'Email đã được xác thực. Bạn có thể tiếp tục tạo tài khoản.';
	      },
	      error: (error: { error?: { message?: string } }) => {
	        this.isOtpVerified = false;
	        this.verifiedEmail = '';
	        this.verifiedOtpCode = '';
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

    const email = this.emailControl.value.trim();
    const otpCode = this.otpCodeControl.value.trim();
    const normalizedEmail = this.normalizeEmailValue(email);

    if (this.passwordMismatch) {
      this.registerForm.controls.confirm_password.markAsTouched();
      return;
    }

    if (!this.isOtpVerified || normalizedEmail !== this.verifiedEmail || otpCode !== this.verifiedOtpCode) {
      this.errorMessage = 'Vui lòng gửi và xác thực OTP hợp lệ trước khi đăng ký.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authApiService.register({
      ...this.registerForm.getRawValue(),
      email,
      otp_code: otpCode
    }).subscribe({
      next: () => {
        this.successMessage = 'Tạo tài khoản thành công.';
        this.registrationCompleted = true;
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

  resetOtpVerificationState(): void {
    this.isOtpVerified = false;
    this.isOtpSent = false;
    this.verifiedEmail = '';
    this.verifiedOtpCode = '';
    this.otpSuccessMessage = '';
    this.otpDeliveryMessage = '';
    this.otpCodeControl.setValue('');
  }

  private markAccountFieldsTouched(): void {
    this.registerForm.controls.fullname.markAsTouched();
    this.registerForm.controls.username.markAsTouched();
    this.registerForm.controls.email.markAsTouched();
    this.registerForm.controls.password.markAsTouched();
    this.registerForm.controls.confirm_password.markAsTouched();
  }

  private normalizeEmailValue(value: string): string {
    return value.trim().toLowerCase();
  }
}
