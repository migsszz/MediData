import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../../data/clinical-api';
import { OfflineQueue } from '../../../data/offline-queue';
import { ALLERGY_CATEGORIES, ALLERGY_SEVERITIES, AllergyCategory, AllergySeverity } from '../../../models/allergy.model';
import { errorMessage } from '../../../forms/validators';
import { Suggestion, TypeaheadComponent } from '../../ui/typeahead.component';

@Component({
  selector: 'app-allergy-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TypeaheadComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-2" aria-label="New allergy">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-1">
        <fieldset class="fieldset sm:col-span-2">
          <label class="label">Substance</label>
          <app-typeahead [control]="form.controls.substance" [search]="searchDrugs" label="Allergic substance" (selected)="rxcui.set($event.value)" (edited)="rxcui.set(null)" />
          @if (message(form.controls.substance, 'Substance'); as m) {
            <p class="text-error text-xs" role="alert">{{ m }}</p>
          }
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="al-cat">Type</label>
          <select id="al-cat" class="select w-full capitalize" formControlName="category">
            @for (c of categories; track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <label class="label" for="al-sev">Severity</label>
          <select id="al-sev" class="select w-full capitalize" formControlName="severity">
            @for (s of severities; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </fieldset>
        <fieldset class="fieldset sm:col-span-4">
          <label class="label" for="al-reaction">Reaction</label>
          <input id="al-reaction" class="input w-full" formControlName="reaction" placeholder="e.g. Hives, anaphylaxis" />
        </fieldset>
      </div>
      @if (errorText()) {
        <p class="text-error text-sm" role="alert">{{ errorText() }}</p>
      }
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save allergy' }}</button>
      </div>
    </form>
  `
})
export class AllergyFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(ClinicalApi);
  private queue = inject(OfflineQueue);
  private queryClient = inject(QueryClient);

  patientId = input.required<string>();
  saved = output<'saved' | 'queued'>();
  cancelled = output<void>();

  protected readonly message = errorMessage;
  protected categories = ALLERGY_CATEGORIES;
  protected severities = ALLERGY_SEVERITIES;
  protected rxcui = signal<string | null>(null);
  protected saving = signal(false);
  protected errorText = signal<string | null>(null);

  protected form = this.fb.group({
    substance: ['' as string | null, [Validators.required, Validators.maxLength(120)]],
    category: ['drug' as AllergyCategory],
    severity: ['moderate' as AllergySeverity],
    reaction: ['']
  });

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
        'create_allergy',
        {
          id: crypto.randomUUID(),
          patient_id: this.patientId(),
          substance: v.substance!.trim(),
          rxcui: this.rxcui(),
          category: v.category!,
          severity: v.severity!,
          reaction: v.reaction?.trim() || null
        },
        `Allergy ${v.substance} for patient`
      );
      this.form.reset({ substance: '', category: 'drug', severity: 'moderate', reaction: '' });
      this.rxcui.set(null);
      await this.queryClient.invalidateQueries({ queryKey: ['patient', this.patientId()] });
      this.saved.emit(outcome);
    } catch (e) {
      this.errorText.set((e as { message?: string }).message ?? 'Could not save the allergy.');
    } finally {
      this.saving.set(false);
    }
  }
}
