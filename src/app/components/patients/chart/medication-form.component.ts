import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../../data/clinical-api';
import { OfflineQueue } from '../../../data/offline-queue';
import type { Allergy } from '../../../models/allergy.model';
import { endNotBeforeStart, errorMessage } from '../../../forms/validators';
import { findAllergyConflicts } from '../../../util/allergy-check';
import { todayIso } from '../../../util/age';
import { Suggestion, TypeaheadComponent } from '../../ui/typeahead.component';

@Component({
  selector: 'app-medication-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TypeaheadComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-2" aria-label="New medication">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
        <fieldset class="fieldset">
          <label class="label">Name</label>
          <app-typeahead [control]="form.controls.name" [search]="searchDrugs" label="Medication name" (selected)="rxcui.set($event.value)" (edited)="rxcui.set(null)" />
          @if (message(form.controls.name, 'Name'); as m) {
            <p class="text-error text-xs" role="alert">{{ m }}</p>
          }
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="med-dose">Dosage</label>
          <input id="med-dose" class="input w-full" formControlName="dosage" placeholder="e.g. 500mg" />
          @if (message(form.controls.dosage, 'Dosage'); as m) {
            <p class="text-error text-xs" role="alert">{{ m }}</p>
          }
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="med-freq">Frequency</label>
          <input id="med-freq" class="input w-full" formControlName="frequency" placeholder="e.g. Twice daily" />
          @if (message(form.controls.frequency, 'Frequency'); as m) {
            <p class="text-error text-xs" role="alert">{{ m }}</p>
          }
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="med-start">Start date</label>
          <input id="med-start" class="input w-full" type="date" formControlName="start_date" />
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="med-end">End date</label>
          <input id="med-end" class="input w-full" type="date" formControlName="end_date" />
          @if (form.errors?.['endBeforeStart']) {
            <p class="text-error text-xs" role="alert">End date can't be before the start date.</p>
          }
        </fieldset>
      </div>

      @if (conflicts().length) {
        <div role="alert" class="alert alert-warning">
          <span class="material-icons">warning</span>
          <div class="flex-1">
            <strong>Possible allergy conflict:</strong>
            @for (a of conflicts(); track a.id; let last = $last) {
              {{ a.substance }} ({{ a.severity }}){{ last ? '' : ',' }}
            }
            <label class="label cursor-pointer justify-start gap-2 mt-1">
              <input type="checkbox" class="checkbox checkbox-sm" [checked]="override()" (change)="override.set($any($event.target).checked)" />
              <span>I've checked and want to prescribe anyway</span>
            </label>
          </div>
        </div>
      }

      @if (errorText()) {
        <p class="text-error text-sm" role="alert">{{ errorText() }}</p>
      }
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving() || (conflicts().length > 0 && !override())">
          {{ saving() ? 'Saving…' : 'Save medication' }}
        </button>
      </div>
    </form>
  `
})
export class MedicationFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(ClinicalApi);
  private queue = inject(OfflineQueue);
  private queryClient = inject(QueryClient);

  patientId = input.required<string>();
  allergies = input<Allergy[]>([]);
  saved = output<'saved' | 'queued'>();
  cancelled = output<void>();

  protected readonly message = errorMessage;
  protected rxcui = signal<string | null>(null);
  protected override = signal(false);
  protected saving = signal(false);
  protected errorText = signal<string | null>(null);

  protected form = this.fb.group(
    {
      name: ['' as string | null, Validators.required],
      dosage: ['', Validators.required],
      frequency: ['', Validators.required],
      start_date: [todayIso(), Validators.required],
      end_date: [null as string | null]
    },
    { validators: endNotBeforeStart('start_date', 'end_date') }
  );

  private name = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });
  protected conflicts = computed(() => findAllergyConflicts(this.name() ?? '', this.rxcui(), this.allergies()));

  protected searchDrugs = async (term: string): Promise<Suggestion[]> =>
    (await this.api.searchDrugs(term)).map((d) => ({ value: d.rxcui, label: d.name, detail: `RxNorm ${d.rxcui}` }));

  async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errorText.set(null);
    const v = this.form.getRawValue();
    try {
      const outcome = await this.queue.submit(
        'create_medication',
        {
          id: crypto.randomUUID(),
          patient_id: this.patientId(),
          name: v.name!.trim(),
          rxcui: this.rxcui(),
          dosage: v.dosage!.trim(),
          frequency: v.frequency!.trim(),
          start_date: v.start_date!,
          end_date: v.end_date || null,
          active: true
        },
        `Medication ${v.name} for patient`
      );
      this.form.reset({ name: '', dosage: '', frequency: '', start_date: todayIso(), end_date: null });
      this.rxcui.set(null);
      this.override.set(false);
      await this.queryClient.invalidateQueries({ queryKey: ['patient', this.patientId()] });
      this.saved.emit(outcome);
    } catch (e) {
      this.errorText.set((e as { message?: string }).message ?? 'Could not save the medication.');
    } finally {
      this.saving.set(false);
    }
  }
}
