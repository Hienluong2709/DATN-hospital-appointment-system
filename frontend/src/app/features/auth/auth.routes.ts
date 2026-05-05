import { Routes } from '@angular/router';
import { environment } from '../../../environments/environment';

const isPatientPortal = environment.portalMode === 'patient';
const isStaffPortal = environment.portalMode === 'staff';

const patientAuthRoutes: Routes = isPatientPortal
  ? [
      {
        path: 'login',
        pathMatch: 'full',
        redirectTo: '/login'
      },
      {
        path: 'patient-login',
        pathMatch: 'full',
        redirectTo: '/login'
      },
      {
        path: 'register',
        pathMatch: 'full',
        redirectTo: '/register'
      }
    ]
  : [];

const staffAuthRoutes: Routes = isStaffPortal
  ? [
      {
        path: 'staff-login',
        pathMatch: 'full',
        redirectTo: '/staff/login'
      }
    ]
  : [];

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: isStaffPortal ? '/staff/login' : '/login'
  }
  ,
  ...patientAuthRoutes,
  ...staffAuthRoutes
];
