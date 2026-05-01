import { Routes } from '@angular/router';
import { roleGuard } from '@guard';

import { AppointmentsPageComponent } from './pages/appointments-page.component';
import { PatientAppointmentsPageComponent } from './pages/patient-appointments-page.component';

export const APPOINTMENT_ROUTES: Routes = [
  {
    path: '',
    canActivate: [roleGuard(['ADMIN', 'DOCTOR', 'RECEPTIONIST'])],
    component: AppointmentsPageComponent
  },
  {
    path: 'patient',
    canActivate: [roleGuard(['PATIENT'])],
    component: PatientAppointmentsPageComponent
  }
];
