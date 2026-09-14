import { Component, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PatientService } from '../../../services/patient.service';
import { Patient } from '../../../models/patient.model';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './patient-list.component.html'
})
export class PatientListComponent implements OnInit {
  patients = signal<Patient[]>([]);
  loading = signal(true);
  searchTerm = signal('');

  filteredPatients = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.patients();
    return this.patients().filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term)
    );
  });

  constructor(private patientService: PatientService) {}

  ngOnInit() {
    this.patientService.list().subscribe({
      next: (patients) => {
        this.patients.set(patients);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearchChange(value: string) {
    this.searchTerm.set(value);
  }
}
