import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PatientService } from '../../../services/patient.service';
import { DeleteGuardService } from '../../../services/delete-guard.service';
import { Patient } from '../../../models/patient.model';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './patient-list.component.html'
})
export class PatientListComponent implements OnInit {
  private patientService = inject(PatientService);
  private deleteGuard = inject(DeleteGuardService);

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

  ngOnInit() {
    this.refresh();
  }

  refresh() {
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

  async deletePatient(p: Patient, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    const proceed = await this.deleteGuard.confirmDelete(
      p.is_seed,
      `${p.first_name} ${p.last_name}`,
      'This also deletes all of their encounters and medications.'
    );
    if (!proceed) return;

    this.patientService.delete(p.id).subscribe(() => this.refresh());
  }
}
