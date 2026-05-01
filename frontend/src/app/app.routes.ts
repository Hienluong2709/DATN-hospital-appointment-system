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
	STAFF_PATH,
	CHANGE_PASSWORD_PATH,
  QUEUES_PATH,
  ROOMS_PATH,
  SERVER_ERROR_PATH,
  SPECIALTIES_PATH,
	WORK_SCHEDULES_PATH,
	WORK_SCHEDULE_BLOCKS_PATH
} from '@constant/navigator-endpoint.constant';
import {
  AccessDeniedComponent,
  LayoutComponent,
  NotFoundComponent,
  PortalHomeRedirectComponent,
  ServerErrorComponent
} from '@layout';

export const routes: Routes = [
	{
		path: '',
		pathMatch: 'full',
		loadComponent: () => import('@features/patient/pages/patient-page.component').then((m) => m.PatientPageComponent)
	},
	{
		path: 'login',
		canActivate: [noAuthGuard],
		loadComponent: () => import('@features/auth/pages/login-page.component').then((m) => m.LoginPageComponent),
		data: { audience: 'patient' }
	},
	{
		path: 'register',
		canActivate: [noAuthGuard],
		loadComponent: () => import('@features/auth/pages/register-page.component').then((m) => m.RegisterPageComponent)
	},
	{
		path: STAFF_PATH,
		children: [
			{
				path: 'login',
				canActivate: [noAuthGuard],
				loadComponent: () => import('@features/auth/pages/login-page.component').then((m) => m.LoginPageComponent),
				data: { audience: 'staff' }
			}
		]
	},
	{
		path: AUTH_PATH,
		loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
	},
	{
		path: STAFF_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
		data: { portal: 'staff' },
		children: [
			{
				path: '',
				pathMatch: 'full',
				component: PortalHomeRedirectComponent,
				data: { portal: 'staff' }
			},
			{
				path: DASHBOARD_PATH,
				canActivate: [roleGuard(['ADMIN'])],
				loadChildren: () => import('@features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES)
			},
			{
				path: SPECIALTIES_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST'])],
				loadChildren: () => import('@features/specialties/specialties.routes').then((m) => m.SPECIALTY_ROUTES)
			},
			{
				path: ROOMS_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST'])],
				loadChildren: () => import('@features/rooms/rooms.routes').then((m) => m.ROOM_ROUTES)
			},
			{
				path: DOCTORS_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST'])],
				loadChildren: () => import('@features/doctors/doctors.routes').then((m) => m.DOCTOR_ROUTES)
			},
			{
				path: USERS_PATH,
				canActivate: [roleGuard(['ADMIN'])],
				loadChildren: () => import('@features/users/users.routes').then((m) => m.USER_ROUTES)
			},
			{
				path: WORK_SCHEDULES_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/work-schedules/work-schedules.routes').then((m) => m.WORK_SCHEDULE_ROUTES)
			},
			{
				path: WORK_SCHEDULE_BLOCKS_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/work-schedule-blocks/work-schedule-blocks.routes').then((m) => m.WORK_SCHEDULE_BLOCK_ROUTES)
			},
			{
				path: APPOINTMENTS_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/appointments/appointments.routes').then((m) => m.STAFF_APPOINTMENT_ROUTES)
			},
			{
				path: QUEUES_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/queues/queues.routes').then((m) => m.QUEUE_ROUTES)
			},
			{
				path: EQUEUE_NUMBERS_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/equeue-numbers/equeue-numbers.routes').then((m) => m.EQUEUE_NUMBER_ROUTES)
			},
			{
				path: ADMIN_PATH,
				canActivate: [roleGuard(['ADMIN'])],
				loadChildren: () => import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES)
			},
			{
				path: RECEPTIONIST_PATH,
				canActivate: [roleGuard(['RECEPTIONIST'])],
				loadChildren: () => import('@features/receptionist/receptionist.routes').then((m) => m.RECEPTIONIST_ROUTES)
			},
			{
				path: DOCTOR_PORTAL_PATH,
				canActivate: [roleGuard(['DOCTOR'])],
				loadChildren: () => import('@features/doctor-portal/doctor-portal.routes').then((m) => m.DOCTOR_PORTAL_ROUTES)
			},
			{
				path: PROFILE_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/profile/profile.routes').then((m) => m.PROFILE_ROUTES)
			},
			{
				path: CHANGE_PASSWORD_PATH,
				canActivate: [roleGuard(['ADMIN', 'RECEPTIONIST', 'DOCTOR'])],
				loadChildren: () => import('@features/change-password/change-password.routes').then((m) => m.CHANGE_PASSWORD_ROUTES)
			}
		]
	},
	{
		path: PATIENT_PATH,
		component: LayoutComponent,
		canActivate: [authGuard, roleGuard(['PATIENT'])],
		data: { portal: 'patient' },
		children: [
			{
				path: '',
				pathMatch: 'full',
				component: PortalHomeRedirectComponent,
				data: { portal: 'patient' }
			},
			{
				path: APPOINTMENTS_PATH,
				canActivate: [roleGuard(['PATIENT'])],
				loadChildren: () => import('@features/appointments/appointments.routes').then((m) => m.PATIENT_APPOINTMENT_ROUTES)
			},
			{
				path: PROFILE_PATH,
				canActivate: [roleGuard(['PATIENT'])],
				loadChildren: () => import('@features/profile/profile.routes').then((m) => m.PROFILE_ROUTES)
			},
			{
				path: CHANGE_PASSWORD_PATH,
				canActivate: [roleGuard(['PATIENT'])],
				loadChildren: () => import('@features/change-password/change-password.routes').then((m) => m.CHANGE_PASSWORD_ROUTES)
			}
		]
	},
	{
		path: `${APPOINTMENTS_PATH}/patient`,
		pathMatch: 'full',
		redirectTo: `${PATIENT_PATH}/${APPOINTMENTS_PATH}`
	},
	{
		path: DASHBOARD_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${DASHBOARD_PATH}`
	},
	{
		path: SPECIALTIES_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${SPECIALTIES_PATH}`
	},
	{
		path: ROOMS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${ROOMS_PATH}`
	},
	{
		path: DOCTORS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${DOCTORS_PATH}`
	},
	{
		path: USERS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${USERS_PATH}`
	},
	{
		path: WORK_SCHEDULES_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${WORK_SCHEDULES_PATH}`
	},
	{
		path: WORK_SCHEDULE_BLOCKS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${WORK_SCHEDULE_BLOCKS_PATH}`
	},
	{
		path: APPOINTMENTS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${APPOINTMENTS_PATH}`
	},
	{
		path: QUEUES_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${QUEUES_PATH}`
	},
	{
		path: EQUEUE_NUMBERS_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${EQUEUE_NUMBERS_PATH}`
	},
	{
		path: ADMIN_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${ADMIN_PATH}`
	},
	{
		path: RECEPTIONIST_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${RECEPTIONIST_PATH}`
	},
	{
		path: DOCTOR_PORTAL_PATH,
		pathMatch: 'full',
		redirectTo: `${STAFF_PATH}/${DOCTOR_PORTAL_PATH}`
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
