import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

import { AuthApiService } from '../../features/auth/services/auth.api';
import { environment } from '../../../environments/environment';
import { RealtimeService } from './realtime.service';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class IdleSessionService {
  private readonly tokenService = inject(TokenService);
  private readonly authApiService = inject(AuthApiService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly router = inject(Router);

  private readonly idleTimeoutMs =
    Number.isFinite(environment.idleTimeoutMs) && environment.idleTimeoutMs > 0
      ? environment.idleTimeoutMs
      : 5 * 60 * 1000;
  private readonly activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

  private timeoutId: number | null = null;
  private isStarted = false;
  private isLoggingOut = false;
  private readonly activityHandler = () => this.resetTimer();
  private readonly navigationSubscription = this.router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) {
      this.resetTimer();
    }
  });

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
      this.realtimeService.disconnect();
      this.tokenService.clearSession();
      const loginPath = environment.portalMode === 'staff' ? '/staff/login' : '/login';
      await this.router.navigateByUrl(loginPath);
      this.isLoggingOut = false;
      this.resetTimer();
    }
  }
}
