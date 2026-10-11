import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../data/clinical-api';
import { OrgService } from '../../data/org.service';
import { keys } from '../../data/queries';
import { downloadCsv, toCsv } from '../../util/csv';
import { ThemeService } from '../../services/theme.service';

type Cohort = 'hypertension' | 'overdue' | null;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [BaseChartDirective, RouterLink],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  private api = inject(ClinicalApi);
  private org = inject(OrgService);
  private theme = inject(ThemeService);

  // The aggregation happens in Postgres (dashboard_stats); the browser only draws it.
  stats = injectQuery(() => ({
    queryKey: keys.dashboard(this.org.orgId() ?? ''),
    queryFn: () => this.api.dashboard(this.org.orgId()!),
    enabled: !!this.org.orgId()
  }));

  openCohort = signal<Cohort>(null);

  hypertension = injectQuery(() => ({
    queryKey: keys.hypertension(this.org.orgId() ?? ''),
    queryFn: () => this.api.hypertensionCohort(this.org.orgId()!),
    enabled: !!this.org.orgId() && this.openCohort() === 'hypertension'
  }));

  overdue = injectQuery(() => ({
    queryKey: keys.overdue(this.org.orgId() ?? ''),
    queryFn: () => this.api.overdueFollowups(this.org.orgId()!, 12),
    enabled: !!this.org.orgId() && this.openCohort() === 'overdue'
  }));

  // Chart colours follow the active style and mode (canvas can't read CSS classes).
  private colors = this.theme.chartColors;

  encountersByMonthData = computed<ChartData<'bar'>>(() => {
    const rows = this.stats.data()?.encounters_by_month ?? [];
    return {
      labels: rows.map((r) => new Date(r.month + 'T00:00:00').toLocaleString('default', { month: 'short', year: '2-digit' })),
      datasets: [{ data: rows.map((r) => r.count), label: 'Encounters', backgroundColor: this.colors().primary, borderRadius: 3 }]
    };
  });

  sexChartData = computed<ChartData<'pie'>>(() => {
    const rows = this.stats.data()?.sex_distribution ?? [];
    const c = this.colors();
    return {
      labels: rows.map((r) => r.sex),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: [c.primary, c.secondary, c.accent, c.info], borderColor: 'transparent' }]
    };
  });

  topDiagnosesData = computed<ChartData<'bar'>>(() => {
    const rows = this.stats.data()?.top_diagnoses ?? [];
    return {
      labels: rows.map((r) => (r.code ? `${r.label} (${r.code})` : r.label)),
      datasets: [{ data: rows.map((r) => r.count), label: 'Cases', backgroundColor: this.colors().secondary, borderRadius: 3 }]
    };
  });

  barOptions = computed<ChartConfiguration['options']>(() => this.axes(false));
  horizontalBarOptions = computed<ChartConfiguration['options']>(() => this.axes(true));
  pieOptions = computed<ChartConfiguration['options']>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: this.colors().text } } }
  }));

  private axes(horizontal: boolean): ChartConfiguration['options'] {
    const c = this.colors();
    const grid = { color: c.grid };
    const ticks = { color: c.text, precision: 0 };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: false } },
      scales: { x: { grid, ticks: { color: c.text } }, y: { beginAtZero: true, grid, ticks } }
    };
  }

  toggleCohort(c: Exclude<Cohort, null>) {
    this.openCohort.set(this.openCohort() === c ? null : c);
  }

  exportHypertension() {
    const rows = (this.hypertension.data() ?? []).map((r) => [r.last_name, r.first_name, r.systolic, r.diastolic, r.observed_at.slice(0, 10)]);
    downloadCsv('hypertension-cohort.csv', toCsv(['Last name', 'First name', 'Systolic', 'Diastolic', 'Measured'], rows));
  }

  exportOverdue() {
    const rows = (this.overdue.data() ?? []).map((r) => [r.last_name, r.first_name, r.last_visit ?? 'never']);
    downloadCsv('overdue-followups.csv', toCsv(['Last name', 'First name', 'Last visit'], rows));
  }
}
