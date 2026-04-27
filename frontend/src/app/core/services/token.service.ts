import { Injectable } from '@angular/core';

import { BackendRole, normalizeBackendRole } from '../models/auth-role.model';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly accessTokenKey = 'access_token';
  private readonly currentUserKey = 'currentUser';
  private readonly legacyUserKeys = ['user', 'auth_user', 'auth'];

  getAccessToken(): string | null {
    const token = localStorage.getItem(this.accessTokenKey);
    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    return token;
  }

  setAccessToken(token: string): void {
    localStorage.setItem(this.accessTokenKey, token);
  }

  getCurrentUser(): Record<string, unknown> | null {
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
    localStorage.setItem(this.currentUserKey, JSON.stringify(user));
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

  getRoleHomePath(): string | null {
    const role = this.getCurrentRole();
    if (!role) {
      return null;
    }

    const roleHomeMap: Record<BackendRole, string> = {
      ADMIN: '/admin',
      RECEPTIONIST: '/receptionist',
      DOCTOR: '/doctor',
      PATIENT: '/patient'
    };

    return roleHomeMap[role];
  }

  clearAccessToken(): void {
    localStorage.removeItem(this.accessTokenKey);
  }

  clearSession(): void {
    this.clearAccessToken();
    localStorage.removeItem(this.currentUserKey);
    for (const key of this.legacyUserKeys) {
      localStorage.removeItem(key);
    }
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

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const normalizedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payloadJson = atob(normalizedBase64);
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      return payload;
    } catch {
      return null;
    }
  }
}
