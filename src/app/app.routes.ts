import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { ShellComponent } from './components/layout/shell.component';
import { LoginComponent } from './components/auth/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PatientListComponent } from './components/patients/patient-list/patient-list.component';
import { PatientFormComponent } from './components/patients/patient-form/patient-form.component';
import { PatientDetailComponent } from './components/patients/patient-detail/patient-detail.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'patients', component: PatientListComponent },
      { path: 'patients/new', component: PatientFormComponent },
      { path: 'patients/:id', component: PatientDetailComponent },
      { path: 'patients/:id/edit', component: PatientFormComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
