import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { ACCESS_DENIED_PATH } from '@constant/navigator-endpoint.constant';
import { TokenService } from '../../../app/core/services/token.service';

export const noAuthGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (!tokenService.getAccessToken()) {
    return true;
  }

  const homePath = tokenService.getRoleHomePath();
  return router.createUrlTree([homePath ?? ACCESS_DENIED_PATH]);
};