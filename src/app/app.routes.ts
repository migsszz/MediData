import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { ShellComponent } from './components/layout/shell.component';
import { LoginComponent } from './components/auth/login/login.component';

// Pages are lazy-loaded so the initial bundle only carries login + the shell
// (Chart.js alone is ~200 kB and only the dashboard needs it).
export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () => import('./components/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES)
      },
      {
        path: 'patients',
        loadComponent: () => import('./components/patients/patient-list/patient-list.component').then((m) => m.PatientListComponent)
      },
      {
        path: 'patients/new',
        loadComponent: () => import('./components/patients/patient-form/patient-form.component').then((m) => m.PatientFormComponent)
      },
      {
        path: 'patients/:id',
        loadComponent: () => import('./components/patients/patient-detail/patient-detail.component').then((m) => m.PatientDetailComponent)
      },
      {
        path: 'patients/:id/edit',
        loadComponent: () => import('./components/patients/patient-form/patient-form.component').then((m) => m.PatientFormComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./components/settings/settings.component').then((m) => m.SettingsComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
