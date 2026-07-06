import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { ACCESS_DENIED_PATH, CHANGE_PASSWORD_PATH, STAFF_PATH } from '@constant/navigator-endpoint.constant';
import { TokenService } from '../../../app/core/services/token.service';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = (_route, state) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (tokenService.hasValidSession() || (!!environment.disableAuthAutoLogout && !!tokenService.getCurrentUser())) {
    const forcedChangePasswordPath = `/${STAFF_PATH}/${CHANGE_PASSWORD_PATH}`;
    if (tokenService.mustChangePassword() && !state.url.startsWith(forcedChangePasswordPath)) {
      return router.createUrlTree(['/', STAFF_PATH, CHANGE_PASSWORD_PATH]);
    }

    return true;
  }

  const redirectUrl = state.url || `/${ACCESS_DENIED_PATH}`;
  const loginCommands = redirectUrl.startsWith(`/${STAFF_PATH}`)
    ? ['/', STAFF_PATH, 'login']
    : ['/', 'login'];

  return router.createUrlTree(loginCommands, {
    queryParams: { redirect: redirectUrl }
  });
};
