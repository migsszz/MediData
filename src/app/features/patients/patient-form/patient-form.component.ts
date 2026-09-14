import { Component, OnInit, inject, signal } from '@angular/core';

import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PatientService } from '../../../core/services/patient.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Sex } from '../../../core/models/patient.model';

@Component({
  selector: 'app-patient-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule
],
  templateUrl: './patient-form.component.html',
  styleUrl: './patient-form.component.scss'
})
export class PatientFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private patientService = inject(PatientService);
  private supabase = inject(SupabaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  patientId = signal<string | null>(null);
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  sexOptions: Sex[] = ['female', 'male', 'other', 'unknown'];

  form = this.fb.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    date_of_birth: ['', Validators.required],
    sex: ['unknown' as Sex, Validators.required],
    phone: [''],
    email: ['', Validators.email],
    address: [''],
    blood_type: [''],
    allergies: [''],
    notes: ['']
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.patientId.set(id);
      this.loading.set(true);
      this.patientService.get(id).subscribe({
        next: (patient) => {
          this.form.patchValue(patient);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
    }
  }

  async submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();
    const id = this.patientId();

    const op = id
      ? this.patientService.update(id, value as any)
      : this.patientService.create({
          ...(value as any),
          created_by: this.supabase.currentSession?.user.id ?? null
        });

    op.subscribe({
      next: (patient) => {
        this.saving.set(false);
        this.router.navigate(['/patients', patient.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.message ?? 'Failed to save patient.');
      }
    });
  }
}
