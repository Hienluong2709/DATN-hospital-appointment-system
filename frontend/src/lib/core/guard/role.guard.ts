import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ACCESS_DENIED_PATH, STAFF_PATH } from '@constant/navigator-endpoint.constant';
import { BackendRole } from '../../../app/core/models/auth-role.model';
import { TokenService } from '../../../app/core/services/token.service';

export const roleGuard = (allowedRoles: BackendRole[]): CanActivateFn => {
  return (_route, state) => {
    const tokenService = inject(TokenService);
    const router = inject(Router);

    if (!tokenService.getAccessToken()) {
      const redirectUrl = state.url || `/${ACCESS_DENIED_PATH}`;
      const loginCommands = redirectUrl.startsWith(`/${STAFF_PATH}`)
        ? ['/', STAFF_PATH, 'login']
        : ['/', 'login'];

      return router.createUrlTree(loginCommands, {
        queryParams: { redirect: redirectUrl }
      });
    }

    const currentRole = tokenService.getCurrentRole();
    if (!currentRole) {
      return router.createUrlTree([ACCESS_DENIED_PATH]);
    }

    if (allowedRoles.includes(currentRole)) {
      return true;
    }

    return router.createUrlTree([ACCESS_DENIED_PATH]);
  };
};
