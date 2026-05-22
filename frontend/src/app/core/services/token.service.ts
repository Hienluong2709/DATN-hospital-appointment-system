import { Injectable } from '@angular/core';

import { BackendRole, normalizeBackendRole } from '../models/auth-role.model';
import { LoginData } from '../../features/auth/models/auth.model';

interface AuthSession {
  accessToken: string;
  tokenType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  user: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly sessionKey = 'auth_session';
  private readonly accessTokenKey = 'access_token';
  private readonly currentUserKey = 'currentUser';
  private readonly legacyUserKeys = ['user', 'auth_user', 'auth'];

  getAccessToken(): string | null {
    const session = this.getSession();
    if (session?.accessToken && !this.isTokenExpired(session.accessToken)) {
      return session.accessToken;
    }

    const legacyToken = localStorage.getItem(this.accessTokenKey);
    if (!legacyToken || this.isTokenExpired(legacyToken)) {
      if (legacyToken) {
        this.clearSession();
      }
      return null;
    }

    return legacyToken;
  }

  setAccessToken(token: string): void {
    const currentSession = this.getSession();
    const nextSession: AuthSession = {
      accessToken: token,
      tokenType: currentSession?.tokenType ?? 'Bearer',
      issuedAt: currentSession?.issuedAt ?? this.extractIssuedAt(token),
      expiresAt: currentSession?.expiresAt ?? this.extractExpiryIso(token),
      expiresInSeconds: currentSession?.expiresInSeconds ?? this.extractExpiryInSeconds(token),
      refreshToken: currentSession?.refreshToken ?? null,
      refreshTokenExpiresAt: currentSession?.refreshTokenExpiresAt ?? null,
      user: currentSession?.user ?? this.getCurrentUser() ?? {},
    };

    this.persistSession(nextSession);
  }

  getCurrentUser(): Record<string, unknown> | null {
    const session = this.getSession();
    if (session?.user && typeof session.user === 'object') {
      return session.user;
    }

    const prioritized = [this.currentUserKey, ...this.legacyUserKeys];

    for (const key of prioritized) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) {
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // Ignore malformed storage values and continue searching.
      }
    }

    return null;
  }

  setCurrentUser(user: unknown): void {
    const currentSession = this.getSession();
    const nextSession: AuthSession = {
      accessToken: currentSession?.accessToken ?? localStorage.getItem(this.accessTokenKey) ?? '',
      tokenType: currentSession?.tokenType ?? 'Bearer',
      issuedAt: currentSession?.issuedAt ?? null,
      expiresAt: currentSession?.expiresAt ?? null,
      expiresInSeconds: currentSession?.expiresInSeconds ?? null,
      refreshToken: currentSession?.refreshToken ?? null,
      refreshTokenExpiresAt: currentSession?.refreshTokenExpiresAt ?? null,
      user: (user as Record<string, unknown>) ?? {},
    };

    this.persistSession(nextSession);
  }

  patchCurrentUser(partial: Record<string, unknown>): void {
    const currentUser = this.getCurrentUser() ?? {};
    this.setCurrentUser({
      ...currentUser,
      ...partial
    });
  }

  setSession(loginData: LoginData): void {
    const accessToken = loginData.accessToken || loginData.token;
    if (!accessToken) {
      this.clearSession();
      return;
    }

    const session: AuthSession = {
      accessToken,
      tokenType: loginData.tokenType || 'Bearer',
      issuedAt: loginData.issuedAt ?? this.extractIssuedAt(accessToken),
      expiresAt: loginData.expiresAt ?? this.extractExpiryIso(accessToken),
      expiresInSeconds: loginData.expiresInSeconds ?? this.extractExpiryInSeconds(accessToken),
      refreshToken: loginData.refreshToken ?? null,
      refreshTokenExpiresAt: loginData.refreshTokenExpiresAt ?? null,
      user: ((loginData.user as unknown) as Record<string, unknown>) ?? {},
    };

    this.persistSession(session);
  }

  hasValidSession(): boolean {
    return (!!this.getAccessToken() || this.canRefreshSession()) && !!this.getCurrentUser();
  }

  getRefreshToken(): string | null {
    const session = this.getSession();
    if (!session?.refreshToken) {
      return null;
    }

    if (this.isIsoExpired(session.refreshTokenExpiresAt)) {
      this.clearSession();
      return null;
    }

    return session.refreshToken;
  }

  getTokenType(): string {
    return this.getSession()?.tokenType ?? 'Bearer';
  }

  canRefreshSession(): boolean {
    const session = this.getSession();
    return !!session?.refreshToken && !this.isIsoExpired(session.refreshTokenExpiresAt);
  }

  getCurrentRole(): BackendRole | null {
    const user = this.getCurrentUser();
    if (!user) {
      return null;
    }

    const roleValue =
      user['roleCode'] ??
      user['roleName'] ??
      (typeof user['role'] === 'object' && user['role'] !== null
        ? (user['role'] as Record<string, unknown>)['code'] ?? (user['role'] as Record<string, unknown>)['name']
        : user['role']);

    return normalizeBackendRole(roleValue);
  }

  mustChangePassword(): boolean {
    const user = this.getCurrentUser();
    if (!user) {
      return false;
    }

    const value = user['must_change_password'] ?? user['mustChangePassword'];
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  getRoleHomePath(): string | null {
    const role = this.getCurrentRole();
    if (!role) {
      return null;
    }

    const roleHomeMap: Record<BackendRole, string> = {
      ADMIN: '/staff/dashboard',
      RECEPTIONIST: '/staff/receptionist',
      DOCTOR: '/staff/doctor',
      PATIENT: '/patient/appointments'
    };

    return roleHomeMap[role];
  }

  clearAccessToken(): void {
    const currentSession = this.getSession();
    if (currentSession?.user) {
      const nextSession: AuthSession = {
        ...currentSession,
        accessToken: '',
        expiresAt: null,
        expiresInSeconds: null,
      };
      localStorage.setItem(this.sessionKey, JSON.stringify(nextSession));
    }

    localStorage.removeItem(this.accessTokenKey);
  }

  clearSession(): void {
    localStorage.removeItem(this.sessionKey);
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.currentUserKey);
    for (const key of this.legacyUserKeys) {
      localStorage.removeItem(key);
    }
  }

  private getSession(): AuthSession | null {
    const rawValue = localStorage.getItem(this.sessionKey);
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<AuthSession>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      if (typeof parsed.accessToken !== 'string') {
        return null;
      }

      return {
        accessToken: parsed.accessToken,
        tokenType: typeof parsed.tokenType === 'string' && parsed.tokenType ? parsed.tokenType : 'Bearer',
        issuedAt: typeof parsed.issuedAt === 'string' ? parsed.issuedAt : null,
        expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : this.extractExpiryIso(parsed.accessToken),
        expiresInSeconds: typeof parsed.expiresInSeconds === 'number' ? parsed.expiresInSeconds : this.extractExpiryInSeconds(parsed.accessToken),
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
        refreshTokenExpiresAt: typeof parsed.refreshTokenExpiresAt === 'string' ? parsed.refreshTokenExpiresAt : null,
        user: parsed.user && typeof parsed.user === 'object' ? parsed.user as Record<string, unknown> : {},
      };
    } catch {
      return null;
    }
  }

  private persistSession(session: AuthSession): void {
    const normalizedSession: AuthSession = {
      accessToken: session.accessToken,
      tokenType: session.tokenType || 'Bearer',
      issuedAt: session.issuedAt ?? this.extractIssuedAt(session.accessToken),
      expiresAt: session.expiresAt ?? this.extractExpiryIso(session.accessToken),
      expiresInSeconds: session.expiresInSeconds ?? this.extractExpiryInSeconds(session.accessToken),
      refreshToken: session.refreshToken ?? null,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt ?? null,
      user: session.user ?? {},
    };

    localStorage.setItem(this.sessionKey, JSON.stringify(normalizedSession));
    localStorage.setItem(this.accessTokenKey, normalizedSession.accessToken);
    localStorage.setItem(this.currentUserKey, JSON.stringify(normalizedSession.user));
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    if (!payload) {
      return true;
    }

    const exp = payload['exp'];
    if (typeof exp !== 'number') {
      return true;
    }

    return Date.now() >= exp * 1000;
  }

  private extractExpiryIso(token: string): string | null {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : null;
  }

  private extractIssuedAt(token: string): string | null {
    const payload = this.decodeJwtPayload(token);
    const iat = payload?.['iat'];
    return typeof iat === 'number' ? new Date(iat * 1000).toISOString() : null;
  }

  private extractExpiryInSeconds(token: string): number | null {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    const iat = payload?.['iat'];
    return typeof exp === 'number' && typeof iat === 'number' ? Math.max(exp - iat, 0) : null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const normalizedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payloadJson = atob(normalizedBase64);
      return JSON.parse(payloadJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isIsoExpired(value: string | null | undefined): boolean {
    if (!value) {
      return true;
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return true;
    }

    return Date.now() >= timestamp;
  }
}
