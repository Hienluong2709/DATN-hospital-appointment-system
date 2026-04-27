import { Routes } from '@angular/router';
import { authGuard, noAuthGuard, roleGuard } from '@guard';
import {
  ACCESS_DENIED_PATH,
	ADMIN_PATH,
  APPOINTMENTS_PATH,
  AUTH_PATH,
	DOCTOR_PORTAL_PATH,
  DASHBOARD_PATH,
  DOCTORS_PATH,
	USERS_PATH,
  EQUEUE_NUMBERS_PATH,
	PATIENT_PATH,
	PROFILE_PATH,
	RECEPTIONIST_PATH,
	CHANGE_PASSWORD_PATH,
  QUEUES_PATH,
  ROOMS_PATH,
  SERVER_ERROR_PATH,
  SPECIALTIES_PATH,
	WORK_SCHEDULES_PATH,
	WORK_SCHEDULE_BLOCKS_PATH
} from '@constant/navigator-endpoint.constant';
import { AccessDeniedComponent, LayoutComponent, NotFoundComponent, ServerErrorComponent } from '@layout';

export const routes: Routes = [
	{
		path: '',
		pathMatch: 'full',
		redirectTo: AUTH_PATH
	},
	{
		path: DASHBOARD_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN'])],
		loadChildren: () => import('@features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES)
	},
	{
		path: AUTH_PATH,
		canActivate: [noAuthGuard],
		loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
	},
	{
		path: SPECIALTIES_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST'])],
		loadChildren: () => import('@features/specialties/specialties.routes').then((m) => m.SPECIALTY_ROUTES)
	},
	{
		path: ROOMS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST'])],
		loadChildren: () => import('@features/rooms/rooms.routes').then((m) => m.ROOM_ROUTES)
	},
	{
		path: DOCTORS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST'])],
		loadChildren: () => import('@features/doctors/doctors.routes').then((m) => m.DOCTOR_ROUTES)
	},
	{
		path: USERS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN'])],
		loadChildren: () => import('@features/users/users.routes').then((m) => m.USER_ROUTES)
	},
	{
		path: WORK_SCHEDULES_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
		loadChildren: () => import('@features/work-schedules/work-schedules.routes').then((m) => m.WORK_SCHEDULE_ROUTES)
	},
	{
		path: WORK_SCHEDULE_BLOCKS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
		loadChildren: () => import('@features/work-schedule-blocks/work-schedule-blocks.routes').then((m) => m.WORK_SCHEDULE_BLOCK_ROUTES)
	},
	{
		path: APPOINTMENTS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'])],
		loadChildren: () => import('@features/appointments/appointments.routes').then((m) => m.APPOINTMENT_ROUTES)
	},
	{
		path: QUEUES_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
		loadChildren: () => import('@features/queues/queues.routes').then((m) => m.QUEUE_ROUTES)
	},
	{
		path: EQUEUE_NUMBERS_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
		loadChildren: () => import('@features/equeue-numbers/equeue-numbers.routes').then((m) => m.EQUEUE_NUMBER_ROUTES)
	},
	{
		path: ADMIN_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN'])],
		loadChildren: () => import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES)
	},
	{
		path: RECEPTIONIST_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['RECEPTIONIST'])],
		loadChildren: () => import('@features/receptionist/receptionist.routes').then((m) => m.RECEPTIONIST_ROUTES)
	},
	{
		path: DOCTOR_PORTAL_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['DOCTOR'])],
		loadChildren: () => import('@features/doctor-portal/doctor-portal.routes').then((m) => m.DOCTOR_PORTAL_ROUTES)
	},
	{
		path: PATIENT_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['PATIENT'])],
		loadChildren: () => import('@features/patient/patient.routes').then((m) => m.PATIENT_ROUTES)
	},
	{
		path: PROFILE_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'])],
		loadChildren: () => import('@features/profile/profile.routes').then((m) => m.PROFILE_ROUTES)
	},
	{
		path: CHANGE_PASSWORD_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'])],
		loadChildren: () => import('@features/change-password/change-password.routes').then((m) => m.CHANGE_PASSWORD_ROUTES)
	},
	{
		path: ACCESS_DENIED_PATH,
		component: AccessDeniedComponent
	},
	{
		path: SERVER_ERROR_PATH,
		component: ServerErrorComponent
	},
	{
		path: '**',
		component: NotFoundComponent
	}
];
