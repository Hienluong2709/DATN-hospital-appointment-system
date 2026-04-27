import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { TokenService } from '../services/token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const accessToken = tokenService.getAccessToken();

  if (!accessToken) {
    return next(req).pipe(
      catchError((error) => {
        if (error?.status === 401) {
          tokenService.clearSession();
        }
        return throwError(() => error);
      })
    );
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  ).pipe(
    catchError((error) => {
      if (error?.status === 401) {
        tokenService.clearSession();
      }
      return throwError(() => error);
    })
  );
};
