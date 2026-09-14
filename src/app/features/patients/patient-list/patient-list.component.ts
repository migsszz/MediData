import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PatientService } from '../../../core/services/patient.service';
import { Patient } from '../../../core/models/patient.model';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './patient-list.component.html',
  styleUrl: './patient-list.component.scss'
})
export class PatientListComponent implements OnInit {
  patients = signal<Patient[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  displayedColumns = ['name', 'dob', 'sex', 'phone', 'actions'];

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
