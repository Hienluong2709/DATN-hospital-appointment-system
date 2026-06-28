import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '../../../core/config/api.config';
import { ApiResponse } from '../../../shared/types/api-response.type';
import {
  ChangePasswordData,
  ChangePasswordOtpVerifyPayload,
  ChangePasswordPayload,
  EmailOtpPayload,
  EmailOtpVerifyPayload,
  LoginData,
  LoginPayload,
  OtpDeliveryData,
  OtpVerifyData,
  PhoneOtpPayload,
  PhoneOtpVerifyPayload,
  ResetPasswordData,
  ResetPasswordPayload,
  RegisterData,
  RegisterPayload
} from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(private readonly http: HttpClient) {}

  login(payload: LoginPayload) {
    return this.http.post<ApiResponse<LoginData>>(`${API_BASE_URL}/auth/login`, payload);
  }

  refresh(refreshToken: string) {
    return this.http.post<ApiResponse<LoginData>>(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
    });
  }

  logout(refreshToken: string) {
    return this.http.post<ApiResponse<{ revoked: boolean }>>(`${API_BASE_URL}/auth/logout`, {
      refreshToken,
    });
  }

  register(payload: RegisterPayload) {
    return this.http.post<ApiResponse<RegisterData>>(`${API_BASE_URL}/auth/register`, payload);
  }

  sendPhoneOtp(payload: PhoneOtpPayload) {
    return this.http.post<ApiResponse<OtpDeliveryData>>(`${API_BASE_URL}/auth/otp/send`, payload);
  }

  verifyPhoneOtp(payload: PhoneOtpVerifyPayload) {
    return this.http.post<ApiResponse<OtpVerifyData>>(`${API_BASE_URL}/auth/otp/verify`, payload);
  }

  sendEmailOtp(payload: EmailOtpPayload) {
    return this.http.post<ApiResponse<OtpDeliveryData>>(`${API_BASE_URL}/auth/otp/email/send`, payload);
  }

  verifyEmailOtp(payload: EmailOtpVerifyPayload) {
    return this.http.post<ApiResponse<OtpVerifyData>>(`${API_BASE_URL}/auth/otp/email/verify`, payload);
  }

  sendChangePasswordOtp() {
    return this.http.post<ApiResponse<OtpDeliveryData>>(`${API_BASE_URL}/auth/change-password/otp/send`, {});
  }

  verifyChangePasswordOtp(payload: ChangePasswordOtpVerifyPayload) {
    return this.http.post<ApiResponse<OtpVerifyData>>(`${API_BASE_URL}/auth/change-password/otp/verify`, payload);
  }

  changePassword(payload: ChangePasswordPayload) {
    return this.http.post<ApiResponse<ChangePasswordData>>(`${API_BASE_URL}/auth/change-password`, payload);
  }

  sendForgotPasswordOtp(email: string) {
    return this.http.post<ApiResponse<OtpDeliveryData>>(`${API_BASE_URL}/auth/forgot-password/otp/send`, { email });
  }

  verifyForgotPasswordOtp(email: string, code: string) {
    return this.http.post<ApiResponse<OtpVerifyData>>(`${API_BASE_URL}/auth/forgot-password/otp/verify`, {
      email,
      code,
    });
  }

  resetForgottenPassword(payload: ResetPasswordPayload) {
    return this.http.post<ApiResponse<ResetPasswordData>>(`${API_BASE_URL}/auth/forgot-password/reset`, payload);
  }
}
