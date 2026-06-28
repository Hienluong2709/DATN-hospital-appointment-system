import { Routes } from '@angular/router';

import { AppointmentsPageComponent } from './pages/appointments-page.component';
import { PatientAppointmentsPageComponent } from './pages/patient-appointments-page.component';

export const STAFF_APPOINTMENT_ROUTES: Routes = [
  {
    path: '',
    component: AppointmentsPageComponent
  }
];

export const PATIENT_APPOINTMENT_ROUTES: Routes = [
  {
    path: '',
    component: PatientAppointmentsPageComponent
  }
];
