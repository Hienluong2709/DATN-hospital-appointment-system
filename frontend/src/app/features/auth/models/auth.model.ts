export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  confirm_password: string;
  fullname: string;
  email?: string | null;
  phone?: string | null;
  otp_code?: string | null;
}

export interface AuthUser {
  id: number;
  username: string;
  fullname?: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status?: string;
}

export interface LoginData {
  accessToken?: string;
  token: string;
  tokenType?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  expiresInSeconds?: number | null;
  refreshToken?: string;
  refreshTokenExpiresAt?: string | null;
  user: AuthUser;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  otpCode?: string | null;
}

export interface ChangePasswordData {
  id: number;
  username: string;
}

export interface RegisterData extends AuthUser {}

export interface PhoneOtpPayload {
  phone: string;
  purpose: 'REGISTER' | 'CHANGE_PASSWORD';
}

export interface PhoneOtpVerifyPayload extends PhoneOtpPayload {
  code: string;
}

export interface EmailOtpPayload {
  email: string;
  purpose: 'REGISTER';
}

export interface EmailOtpVerifyPayload extends EmailOtpPayload {
  code: string;
}

export interface ChangePasswordOtpVerifyPayload {
  code: string;
}

export interface OtpDeliveryData {
  otp_id: number;
  phone?: string;
  email?: string;
  purpose: string;
  expires_at?: string;
  provider?: string;
  tracking_id?: string | null;
  provider_message_id?: string | null;
  username?: string;
}

export interface OtpVerifyData {
  phone?: string;
  email?: string;
  purpose: string;
  verified_at: string;
  otp_id: number;
}
