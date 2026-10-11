import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../../data/clinical-api';
import { keys } from '../../../data/queries';
import { SEX_OPTIONS, Sex, PatientInput } from '../../../models/patient.model';
import { BLOOD_TYPE_OPTIONS, bloodType, errorMessage, plausibleBirthDate } from '../../../forms/validators';

@Component({
  selector: 'app-patient-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-form.component.html'
})
export class PatientFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(ClinicalApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private queryClient = inject(QueryClient);

  patientId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  sexOptions = SEX_OPTIONS;
  bloodTypes = BLOOD_TYPE_OPTIONS;
  protected readonly message = errorMessage;

  form = this.fb.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    date_of_birth: ['', [Validators.required, plausibleBirthDate()]],
    sex: ['unknown' as Sex, Validators.required],
    phone: ['', Validators.maxLength(40)],
    email: ['', Validators.email],
    address: [''],
    blood_type: ['', bloodType()],
    notes: ['']
  });

  existing = injectQuery(() => ({
    queryKey: keys.patient(this.patientId() ?? 'new'),
    queryFn: () => this.api.getPatient(this.patientId()!),
    enabled: !!this.patientId()
  }));

  constructor() {
    effect(() => {
      const p = this.existing.data();
      if (p) this.form.patchValue({ ...p, phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', blood_type: p.blood_type ?? '', notes: p.notes ?? '' });
    });
  }

  async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    // Empty optional fields are stored as null, not ''.
    const v = this.form.getRawValue();
    const input: PatientInput = {
      first_name: v.first_name!.trim(),
      last_name: v.last_name!.trim(),
      date_of_birth: v.date_of_birth!,
      sex: v.sex!,
      phone: v.phone?.trim() || null,
      email: v.email?.trim() || null,
      address: v.address?.trim() || null,
      blood_type: v.blood_type?.toUpperCase() || null,
      notes: v.notes?.trim() || null
    };

    try {
      const id = this.patientId();
      const saved = id ? await this.api.updatePatient(id, input) : await this.api.createPatient(input);
      await this.queryClient.invalidateQueries({ queryKey: ['patients'] });
      await this.queryClient.invalidateQueries({ queryKey: keys.patient(saved.id) });
      this.router.navigate(['/patients', saved.id]);
    } catch (err) {
      this.errorMessage.set((err as { message?: string }).message ?? 'Failed to save patient.');
    } finally {
      this.saving.set(false);
    }
  }
}
