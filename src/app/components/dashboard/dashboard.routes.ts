import { Routes } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

/** Lazy route group: Chart.js is registered here so it only loads with the dashboard. */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    providers: [provideCharts(withDefaultRegisterables())],
    loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent)
  }
];
