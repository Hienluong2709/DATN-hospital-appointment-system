import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthApiService } from '../../features/auth/services/auth.api';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class IdleSessionService {
  private readonly tokenService = inject(TokenService);
  private readonly authApiService = inject(AuthApiService);
  private readonly router = inject(Router);

  private readonly idleTimeoutMs = environment.idleTimeoutMs;
  private readonly activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

  private timeoutId: number | null = null;
  private isStarted = false;
  private isLoggingOut = false;
  private readonly activityHandler = () => this.resetTimer();

  startMonitoring(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;

    this.activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, this.activityHandler, { passive: true });
    });

    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (!this.tokenService.hasValidSession()) {
      return;
    }

    this.timeoutId = window.setTimeout(() => {
      void this.handleIdleTimeout();
    }, this.idleTimeoutMs);
  }

  private async handleIdleTimeout(): Promise<void> {
    if (this.isLoggingOut || !this.tokenService.hasValidSession()) {
      return;
    }

    this.isLoggingOut = true;

    try {
      const refreshToken = this.tokenService.getRefreshToken();
      if (refreshToken) {
        await new Promise<void>((resolve) => {
          this.authApiService.logout(refreshToken).subscribe({
            next: () => resolve(),
            error: () => resolve(),
          });
        });
      }
    } finally {
      this.tokenService.clearSession();
      const loginPath = environment.portalMode === 'staff' ? '/staff/login' : '/login';
      await this.router.navigateByUrl(loginPath);
      this.isLoggingOut = false;
      this.resetTimer();
    }
  }
}
