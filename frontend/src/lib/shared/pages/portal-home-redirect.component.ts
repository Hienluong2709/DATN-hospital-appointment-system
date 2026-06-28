import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ACCESS_DENIED_PATH } from '../../../app/shared/constant/navigator-endpoint.constant';
import { TokenService } from '../../../app/core/services/token.service';

@Component({
  selector: 'app-portal-home-redirect',
  standalone: true,
  template: ''
})
export class PortalHomeRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);

  ngOnInit(): void {
    const portal = this.route.snapshot.data['portal'];
    const expectedPrefix = portal === 'patient' ? '/patient/' : '/staff/';
    const roleHomePath = this.tokenService.getRoleHomePath();
    const targetPath =
      typeof roleHomePath === 'string' && roleHomePath.startsWith(expectedPrefix)
        ? roleHomePath
        : `/${ACCESS_DENIED_PATH}`;

    void this.router.navigateByUrl(targetPath, {
      replaceUrl: true
    });
  }
}
