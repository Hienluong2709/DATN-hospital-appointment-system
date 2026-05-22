import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { DASHBOARD_PATH } from '@constant/navigator-endpoint.constant';
import { TokenService } from '../../../core/services/token.service';
import { AuthApiService } from '../../auth/services/auth.api';
import { UsersApiService } from '../../users/services/users.api';

const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password-page.component.html',
  styleUrl: './change-password-page.component.scss'
})
export class ChangePasswordPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authApiService = inject(AuthApiService);
  private readonly tokenService = inject(TokenService);
  private readonly usersApiService = inject(UsersApiService);
  private readonly router = inject(Router);

  isSubmitting = false;
  isSendingOtp = false;
  isVerifyingOtp = false;
  isLoadingProfile = false;
  isOtpVerified = false;
  errorMessage = '';
  successMessage = '';
  otpErrorMessage = '';
  otpSuccessMessage = '';
  otpDeliveryMessage = '';
  successDismissSecondsRemaining = 0;
  phoneNumber = '';
  maskedPhoneNumber = '';
  readonly isForcedPasswordChange = this.tokenService.mustChangePassword();
  private verifiedOtpCode = '';

  private successHideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private successCountdownIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD_PATTERN)]],
      confirmPassword: ['', [Validators.required]],
      otpCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    },
    {
      validators: [this.matchPasswordsValidator('newPassword', 'confirmPassword')]
    }
  );

  get currentPasswordControl(): AbstractControl<string, string> {
    return this.form.controls.currentPassword;
  }

  get newPasswordControl(): AbstractControl<string, string> {
    return this.form.controls.newPassword;
  }

  get confirmPasswordControl(): AbstractControl<string, string> {
    return this.form.controls.confirmPassword;
  }

  get otpCodeControl(): AbstractControl<string, string> {
    return this.form.controls.otpCode;
  }

  get canShowPasswordForm(): boolean {
    return this.isForcedPasswordChange || this.isOtpVerified;
  }

  ngOnInit(): void {
    if (this.isForcedPasswordChange) {
      this.otpCodeControl.clearValidators();
      this.otpCodeControl.updateValueAndValidity();
      return;
    }

    this.loadCurrentUserPhone();
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.clearSuccessFeedbackTimers();
    this.successDismissSecondsRemaining = 0;

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.errorMessage = 'Vui lòng kiểm tra lại thông tin mật khẩu';
      return;
    }

    const { currentPassword, newPassword, confirmPassword, otpCode } = this.form.getRawValue();

    if (!this.isForcedPasswordChange && (!this.isOtpVerified || otpCode.trim() !== this.verifiedOtpCode)) {
      this.errorMessage = 'Vui lòng gửi và xác thực OTP trước khi đổi mật khẩu.';
      return;
    }

    this.isSubmitting = true;

    this.authApiService
      .changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
        otpCode: this.isForcedPasswordChange ? undefined : otpCode
      })
      .subscribe({
        next: (response) => {
          this.successMessage = response.message ?? 'Đổi mật khẩu thành công';
          this.tokenService.patchCurrentUser({ must_change_password: false });
          this.form.reset({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
            otpCode: ''
          });
          this.form.markAsPristine();
          this.form.markAsUntouched();
          this.resetOtpVerificationState();
          this.otpDeliveryMessage = '';
          if (this.isForcedPasswordChange) {
            const roleHomePath = this.tokenService.getRoleHomePath();
            setTimeout(() => {
              void this.router.navigateByUrl(roleHomePath ?? `/${DASHBOARD_PATH}`);
            }, 800);
            return;
          }

          this.startSuccessFeedbackAutoHide();
        },
        error: (error: { error?: { message?: string } }) => {
          this.errorMessage = error.error?.message ?? 'Đổi mật khẩu thất bại';
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
  }

  sendOtp(): void {
    if (!this.phoneNumber) {
      this.otpErrorMessage = 'Tài khoản chưa có số điện thoại để gửi OTP.';
      return;
    }

    this.isSendingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';
    this.errorMessage = '';
    this.resetOtpVerificationState();

    this.authApiService.sendChangePasswordOtp().subscribe({
      next: () => {
        this.otpDeliveryMessage = `OTP đã được gửi tới ${this.maskedPhoneNumber || 'số điện thoại của bạn'}.`;
      },
      error: (error: { error?: { message?: string } }) => {
        this.otpErrorMessage = error.error?.message ?? 'Không thể gửi OTP đổi mật khẩu.';
      },
      complete: () => {
        this.isSendingOtp = false;
      }
    });
  }

  verifyOtp(): void {
    const code = this.otpCodeControl.value.trim();
    if (!code) {
      this.otpErrorMessage = 'Vui lòng nhập mã OTP.';
      return;
    }

    this.isVerifyingOtp = true;
    this.otpErrorMessage = '';
    this.otpSuccessMessage = '';

    this.authApiService.verifyChangePasswordOtp({ code }).subscribe({
      next: () => {
        this.isOtpVerified = true;
        this.verifiedOtpCode = code;
        this.otpSuccessMessage = 'Xác thực OTP thành công. Bạn có thể đổi mật khẩu.';
        this.errorMessage = '';
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

  onOtpCodeInput(): void {
    if (!this.isOtpVerified) {
      return;
    }

    if (this.otpCodeControl.value.trim() !== this.verifiedOtpCode) {
      this.resetOtpVerificationState();
    }
  }

  ngOnDestroy(): void {
    this.clearSuccessFeedbackTimers();
  }

  goBackToDashboard(): void {
    if (this.isForcedPasswordChange) {
      return;
    }

    const roleHomePath = this.tokenService.getRoleHomePath();
    void this.router.navigateByUrl(roleHomePath ?? `/${DASHBOARD_PATH}`);
  }

  private loadCurrentUserPhone(): void {
    this.isLoadingProfile = true;
    this.usersApiService.getMe().subscribe({
      next: (response) => {
        this.phoneNumber = response.data.phone ?? '';
        this.maskedPhoneNumber = this.maskPhone(this.phoneNumber);
      },
      error: () => {
        const fallbackPhone = this.asText(this.tokenService.getCurrentUser()?.['phone']);
        this.phoneNumber = fallbackPhone;
        this.maskedPhoneNumber = this.maskPhone(fallbackPhone);
      },
      complete: () => {
        this.isLoadingProfile = false;
      }
    });
  }

  private matchPasswordsValidator(newPasswordKey: string, confirmPasswordKey: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const newPasswordControl = control.get(newPasswordKey);
      const confirmPasswordControl = control.get(confirmPasswordKey);

      if (!newPasswordControl || !confirmPasswordControl) {
        return null;
      }

      return newPasswordControl.value === confirmPasswordControl.value ? null : { passwordMismatch: true };
    };
  }

  private startSuccessFeedbackAutoHide(): void {
    const durationSeconds = 5;
    this.successDismissSecondsRemaining = durationSeconds;

    this.successCountdownIntervalId = setInterval(() => {
      if (this.successDismissSecondsRemaining > 0) {
        this.successDismissSecondsRemaining -= 1;
      }
    }, 1000);

    this.successHideTimeoutId = setTimeout(() => {
      this.successMessage = '';
      this.successDismissSecondsRemaining = 0;
      this.clearSuccessFeedbackTimers();
    }, durationSeconds * 1000);
  }

  private clearSuccessFeedbackTimers(): void {
    if (this.successHideTimeoutId) {
      clearTimeout(this.successHideTimeoutId);
      this.successHideTimeoutId = null;
    }

    if (this.successCountdownIntervalId) {
      clearInterval(this.successCountdownIntervalId);
      this.successCountdownIntervalId = null;
    }
  }

  private resetOtpVerificationState(): void {
    this.isOtpVerified = false;
    this.verifiedOtpCode = '';
    this.otpSuccessMessage = '';
    this.form.patchValue({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    this.currentPasswordControl.markAsPristine();
    this.newPasswordControl.markAsPristine();
    this.confirmPasswordControl.markAsPristine();
    this.currentPasswordControl.markAsUntouched();
    this.newPasswordControl.markAsUntouched();
    this.confirmPasswordControl.markAsUntouched();
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) {
      return phone;
    }

    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }

  private asText(value: unknown): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
  }
}
