import { Routes } from '@angular/router';

import { UsersPageComponent } from './pages/users-page.component';

export const USER_ROUTES: Routes = [
  {
    path: '',
    component: UsersPageComponent,
    data: { mode: 'staff' }
  },
  {
    path: 'patients',
    component: UsersPageComponent,
    data: { mode: 'patients' }
  }
];
