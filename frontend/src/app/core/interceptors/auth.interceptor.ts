import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, map, Observable, shareReplay, switchMap, throwError } from 'rxjs';

import { AuthApiService } from '../../features/auth/services/auth.api';
import { TokenService } from '../services/token.service';

const AUTH_ENDPOINTS_TO_SKIP = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
];

let refreshRequest$: Observable<string | null> | null = null;

const shouldSkipAuthHandling = (url: string): boolean =>
  AUTH_ENDPOINTS_TO_SKIP.some((path) => url.includes(path));

const clearSessionOnUnauthorized = (tokenService: TokenService, error: unknown) => {
  const httpError = error as { status?: number; error?: { message?: string } };
  if (httpError?.status === 401 || (httpError?.status === 403 && httpError?.error?.message === 'Tài khoản đã bị khóa')) {
    tokenService.clearSession();
  }
};

const refreshAccessToken = (authApiService: AuthApiService, tokenService: TokenService) => {
  if (!refreshRequest$) {
    const refreshToken = tokenService.getRefreshToken();

    if (!refreshToken) {
      tokenService.clearSession();
      return throwError(() => new Error('Phiên đăng nhập đã hết hạn'));
    }

    refreshRequest$ = authApiService.refresh(refreshToken).pipe(
      map((response) => {
        tokenService.setSession(response.data);
        return tokenService.getAccessToken();
      }),
      catchError((error) => {
        tokenService.clearSession();
        return throwError(() => error);
      }),
      shareReplay(1)
    );

    refreshRequest$.subscribe({
      error: () => {
        refreshRequest$ = null;
      },
      complete: () => {
        refreshRequest$ = null;
      }
    });
  }

  return refreshRequest$;
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const authApiService = inject(AuthApiService);

  if (shouldSkipAuthHandling(req.url)) {
    return next(req);
  }

  const accessToken = tokenService.getAccessToken();
  if (accessToken) {
    return next(
      req.clone({
        setHeaders: {
          Authorization: `${tokenService.getTokenType()} ${accessToken}`
        }
      })
    ).pipe(
      catchError((error) => {
        clearSessionOnUnauthorized(tokenService, error);
        return throwError(() => error);
      })
    );
  }

  if (tokenService.canRefreshSession()) {
    return refreshAccessToken(authApiService, tokenService).pipe(
      switchMap((refreshedAccessToken) => {
        if (!refreshedAccessToken) {
          return throwError(() => new Error('Không thể làm mới access token'));
        }

        return next(
          req.clone({
            setHeaders: {
              Authorization: `${tokenService.getTokenType()} ${refreshedAccessToken}`
            }
          })
        );
      }),
      catchError((error) => {
        clearSessionOnUnauthorized(tokenService, error);
        return throwError(() => error);
      })
    );
  }

  return next(req).pipe(
    catchError((error) => {
      clearSessionOnUnauthorized(tokenService, error);
      return throwError(() => error);
    })
  );
};
