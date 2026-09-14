import { Component, OnInit, signal, computed } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin } from 'rxjs';
import { PatientService } from '../../services/patient.service';
import { EncounterService } from '../../services/encounter.service';
import { Patient } from '../../models/patient.model';
import { Encounter } from '../../models/encounter.model';

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  patients = signal<Patient[]>([]);
  encounters = signal<Encounter[]>([]);

  totalPatients = computed(() => this.patients().length);

  averageAge = computed(() => {
    const list = this.patients();
    if (!list.length) return 0;
    const total = list.reduce((sum, p) => sum + ageFromDob(p.date_of_birth), 0);
    return Math.round(total / list.length);
  });

  encountersThisMonth = computed(() => {
    const now = new Date();
    return this.encounters().filter((e) => {
      const d = new Date(e.visit_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  });

  sexChartData = computed<ChartData<'pie'>>(() => {
    const counts: Record<string, number> = {};
    for (const p of this.patients()) {
      counts[p.sex] = (counts[p.sex] ?? 0) + 1;
    }
    return {
      labels: Object.keys(counts),
      datasets: [{ data: Object.values(counts) }]
    };
  });

  encountersByMonthData = computed<ChartData<'bar'>>(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
    }

    const counts = new Array(6).fill(0);
    for (const e of this.encounters()) {
      const d = new Date(e.visit_date);
      const diffMonths =
        (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diffMonths >= 0 && diffMonths < 6) {
        counts[5 - diffMonths]++;
      }
    }

    return {
      labels: months,
      datasets: [{ data: counts, label: 'Encounters', backgroundColor: '#3f51b5' }]
    };
  });

  topDiagnosesData = computed<ChartData<'bar'>>(() => {
    const counts: Record<string, number> = {};
    for (const e of this.encounters()) {
      if (!e.diagnosis) continue;
      const key = e.diagnosis.trim();
      if (!key) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      labels: sorted.map(([label]) => label),
      datasets: [{ data: sorted.map(([, count]) => count), label: 'Cases', backgroundColor: '#00897b' }]
    };
  });

  barOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  horizontalBarOptions: ChartConfiguration['options'] = {
    ...this.barOptions,
    indexAxis: 'y' as const
  };

  pieOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false
  };

  constructor(private patientService: PatientService, private encounterService: EncounterService) {}

  ngOnInit() {
    forkJoin({
      patients: this.patientService.list(),
      encounters: this.encounterService.listAll()
    }).subscribe({
      next: ({ patients, encounters }) => {
        this.patients.set(patients);
        this.encounters.set(encounters);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
