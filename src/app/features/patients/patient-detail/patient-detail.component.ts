import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';

import { PatientService } from '../../../core/services/patient.service';
import { EncounterService } from '../../../core/services/encounter.service';
import { MedicationService } from '../../../core/services/medication.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Patient } from '../../../core/models/patient.model';
import { Encounter } from '../../../core/models/encounter.model';
import { Medication } from '../../../core/models/medication.model';

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
  selector: 'app-patient-detail',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatExpansionModule
  ],
  templateUrl: './patient-detail.component.html',
  styleUrl: './patient-detail.component.scss'
})
export class PatientDetailComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private patientService = inject(PatientService);
  private encounterService = inject(EncounterService);
  private medicationService = inject(MedicationService);
  private supabase = inject(SupabaseService);

  patient = signal<Patient | null>(null);
  encounters = signal<Encounter[]>([]);
  medications = signal<Medication[]>([]);
  loading = signal(true);
  savingEncounter = signal(false);
  savingMedication = signal(false);

  encounterForm = this.fb.group({
    visit_date: [new Date().toISOString().slice(0, 10), Validators.required],
    reason: ['', Validators.required],
    diagnosis: [''],
    notes: [''],
    blood_pressure_systolic: [null as number | null],
    blood_pressure_diastolic: [null as number | null],
    heart_rate: [null as number | null],
    temperature_c: [null as number | null],
    weight_kg: [null as number | null],
    height_cm: [null as number | null],
    spo2: [null as number | null]
  });

  medicationForm = this.fb.group({
    name: ['', Validators.required],
    dosage: ['', Validators.required],
    frequency: ['', Validators.required],
    start_date: [new Date().toISOString().slice(0, 10), Validators.required],
    end_date: [null as string | null],
    active: [true]
  });


  get patientId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  get age(): number | null {
    const p = this.patient();
    return p ? ageFromDob(p.date_of_birth) : null;
  }

  ngOnInit() {
    const id = this.patientId;
    this.patientService.get(id).subscribe((patient) => {
      this.patient.set(patient);
      this.loading.set(false);
    });
    this.refreshEncounters();
    this.refreshMedications();
  }

  refreshEncounters() {
    this.encounterService.listForPatient(this.patientId).subscribe((encounters) => {
      this.encounters.set(encounters);
    });
  }

  refreshMedications() {
    this.medicationService.listForPatient(this.patientId).subscribe((medications) => {
      this.medications.set(medications);
    });
  }

  addEncounter() {
    if (this.encounterForm.invalid) return;
    this.savingEncounter.set(true);

    this.encounterService
      .create({
        ...(this.encounterForm.getRawValue() as any),
        patient_id: this.patientId
      })
      .subscribe({
        next: () => {
          this.savingEncounter.set(false);
          this.encounterForm.reset({
            visit_date: new Date().toISOString().slice(0, 10),
            reason: '',
            diagnosis: '',
            notes: '',
            blood_pressure_systolic: null,
            blood_pressure_diastolic: null,
            heart_rate: null,
            temperature_c: null,
            weight_kg: null,
            height_cm: null,
            spo2: null
          });
          this.refreshEncounters();
        },
        error: () => this.savingEncounter.set(false)
      });
  }

  addMedication() {
    if (this.medicationForm.invalid) return;
    this.savingMedication.set(true);

    this.medicationService
      .create({
        ...(this.medicationForm.getRawValue() as any),
        patient_id: this.patientId
      })
      .subscribe({
        next: () => {
          this.savingMedication.set(false);
          this.medicationForm.reset({
            name: '',
            dosage: '',
            frequency: '',
            start_date: new Date().toISOString().slice(0, 10),
            end_date: null,
            active: true
          });
          this.refreshMedications();
        },
        error: () => this.savingMedication.set(false)
      });
  }
}
