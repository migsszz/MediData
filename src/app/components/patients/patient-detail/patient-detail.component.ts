import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { PatientService } from '../../../services/patient.service';
import { EncounterService } from '../../../services/encounter.service';
import { MedicationService } from '../../../services/medication.service';
import { SupabaseService } from '../../../services/supabase.service';
import { DeleteGuardService } from '../../../services/delete-guard.service';
import { Patient } from '../../../models/patient.model';
import { Encounter } from '../../../models/encounter.model';
import { Medication } from '../../../models/medication.model';

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
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './patient-detail.component.html'
})
export class PatientDetailComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private patientService = inject(PatientService);
  private encounterService = inject(EncounterService);
  private medicationService = inject(MedicationService);
  private supabase = inject(SupabaseService);
  private deleteGuard = inject(DeleteGuardService);

  patient = signal<Patient | null>(null);
  encounters = signal<Encounter[]>([]);
  medications = signal<Medication[]>([]);
  loading = signal(true);
  savingEncounter = signal(false);
  savingMedication = signal(false);

  activeTab = signal<'encounters' | 'medications'>('encounters');
  showEncounterForm = signal(false);
  showMedicationForm = signal(false);

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
        patient_id: this.patientId,
        created_by: this.supabase.currentSession?.user.id ?? null
      })
      .subscribe({
        next: () => {
          this.savingEncounter.set(false);
          this.showEncounterForm.set(false);
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
        patient_id: this.patientId,
        created_by: this.supabase.currentSession?.user.id ?? null
      })
      .subscribe({
        next: () => {
          this.savingMedication.set(false);
          this.showMedicationForm.set(false);
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

  async deletePatient() {
    const p = this.patient();
    if (!p) return;

    const proceed = await this.deleteGuard.confirmDelete(
      p.is_seed,
      `${p.first_name} ${p.last_name}`,
      'This also deletes all of their encounters and medications.'
    );
    if (!proceed) return;

    this.patientService.delete(p.id).subscribe(() => this.router.navigateByUrl('/patients'));
  }

  async deleteEncounter(e: Encounter) {
    const proceed = await this.deleteGuard.confirmDelete(e.is_seed, `the encounter from ${e.visit_date}`);
    if (!proceed) return;

    this.encounterService.delete(e.id).subscribe(() => this.refreshEncounters());
  }

  async deleteMedication(m: Medication) {
    const proceed = await this.deleteGuard.confirmDelete(m.is_seed, m.name);
    if (!proceed) return;

    this.medicationService.delete(m.id).subscribe(() => this.refreshMedications());
  }
}
