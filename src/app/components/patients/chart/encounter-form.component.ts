import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi, EncounterDraft } from '../../../data/clinical-api';
import { OfflineQueue } from '../../../data/offline-queue';
import { VITALS } from '../../../models/vitals';
import { bloodPressurePair, errorMessage, notInFuture, vitalRange } from '../../../forms/validators';
import { todayIso } from '../../../util/age';
import { Suggestion, TypeaheadComponent } from '../../ui/typeahead.component';
import { IconComponent } from '../../ui/icon.component';

const REASON_PRESETS = ['Annual checkup', 'Follow-up visit', 'Acute symptoms', 'Prescription refill', 'Lab review'];

/** Draft is kept per patient for the browser session only: it can contain clinical notes. */
const draftKey = (patientId: string) => `medidata-encounter-draft-${patientId}`;

/**
 * Point-of-care encounter entry. Keyboard-first: the reason field takes focus on
 * open, Tab walks vitals in clinical order, and Ctrl/Cmd+Enter saves. Work in
 * progress is autosaved as a draft, and saving goes through the offline queue so
 * a dropped connection doesn't lose the visit.
 */
@Component({
  selector: 'app-encounter-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ReactiveFormsModule, TypeaheadComponent],
  templateUrl: './encounter-form.component.html'
})
export class EncounterFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(ClinicalApi);
  private queue = inject(OfflineQueue);
  private queryClient = inject(QueryClient);

  patientId = input.required<string>();
  patientName = input.required<string>();
  saved = output<'saved' | 'queued'>();
  cancelled = output<void>();

  protected vitals = VITALS;
  protected presets = REASON_PRESETS;
  protected readonly message = errorMessage;
  protected saving = signal(false);
  protected errorText = signal<string | null>(null);
  protected draftRestored = signal(false);
  private reasonInput = viewChild<ElementRef<HTMLInputElement>>('reason');

  /** Stable per form instance, so a double-click or a retry can't create two encounters. */
  private encounterId = crypto.randomUUID();

  protected form = this.fb.group({
    visit_date: [todayIso(), [Validators.required, notInFuture()]],
    reason: ['', [Validators.required, Validators.maxLength(200)]],
    notes: [''],
    vitals: this.fb.group(
      Object.fromEntries(VITALS.map((v) => [v.key, [null as number | null, vitalRange(v)]])),
      { validators: bloodPressurePair('systolic', 'diastolic') }
    ),
    diagnoses: this.fb.array([this.newDiagnosis(true)])
  });

  constructor() {
    effect(() => {
      // Runs once the patient id is known: restore any unsaved draft, then focus.
      const id = this.patientId();
      this.restoreDraft(id);
      queueMicrotask(() => this.reasonInput()?.nativeElement.focus());
    });
    this.form.valueChanges.subscribe(() => this.saveDraft());
  }

  protected get diagnoses() {
    return this.form.controls.diagnoses as FormArray<ReturnType<EncounterFormComponent['newDiagnosis']>>;
  }

  protected newDiagnosis(primary = false) {
    return this.fb.group({
      description: this.fb.control<string | null>(''),
      icd10_code: this.fb.control<string | null>(null),
      is_primary: this.fb.control(primary)
    });
  }

  protected searchIcd = async (term: string): Promise<Suggestion[]> =>
    (await this.api.searchIcd10(term)).map((c) => ({ value: c.code, label: c.description, detail: c.code }));

  protected pickIcd(i: number, s: Suggestion) {
    this.diagnoses.at(i).patchValue({ icd10_code: s.value, description: s.label });
  }

  protected clearCode(i: number) {
    this.diagnoses.at(i).patchValue({ icd10_code: null }, { emitEvent: false });
  }

  protected addDiagnosis() {
    this.diagnoses.push(this.newDiagnosis(this.diagnoses.length === 0));
  }

  protected removeDiagnosis(i: number) {
    const wasPrimary = this.diagnoses.at(i).value.is_primary;
    this.diagnoses.removeAt(i);
    if (wasPrimary && this.diagnoses.length) this.diagnoses.at(0).patchValue({ is_primary: true });
  }

  protected setPrimary(i: number) {
    this.diagnoses.controls.forEach((g, idx) => g.patchValue({ is_primary: idx === i }, { emitEvent: false }));
    this.saveDraft();
  }

  protected usePreset(reason: string) {
    this.form.patchValue({ reason });
    this.form.controls.reason.markAsDirty();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.submit();
    }
  }

  protected vitalError(key: string): string | null {
    const c = this.form.controls.vitals.get(key);
    const def = VITALS.find((v) => v.key === key)!;
    return errorMessage(c ?? null, def.label);
  }

  protected get bpError(): string | null {
    const g = this.form.controls.vitals;
    if (!g.touched && !g.dirty) return null;
    if (g.errors?.['bpIncomplete']) return 'Enter both systolic and diastolic.';
    if (g.errors?.['bpOrder']) return 'Systolic should be higher than diastolic.';
    return null;
  }

  async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errorText.set(null);

    const v = this.form.getRawValue();
    const vitals: Record<string, number> = {};
    for (const def of VITALS) {
      const raw = (v.vitals as Record<string, number | null>)[def.key];
      if (raw !== null && raw !== undefined && `${raw}` !== '') vitals[def.code] = Number(raw);
    }
    const diagnoses = v.diagnoses
      .filter((d) => (d.description ?? '').trim())
      .map((d) => ({ icd10_code: d.icd10_code, description: d.description!.trim(), is_primary: !!d.is_primary }));
    if (diagnoses.length && !diagnoses.some((d) => d.is_primary)) diagnoses[0].is_primary = true;

    const draft: EncounterDraft = {
      id: this.encounterId,
      patient_id: this.patientId(),
      visit_date: v.visit_date!,
      reason: v.reason!.trim(),
      notes: v.notes?.trim() || null,
      vitals,
      diagnoses
    };

    try {
      const outcome = await this.queue.submit('record_encounter', draft, `Encounter ${draft.visit_date} for ${this.patientName()}`);
      this.clearDraft();
      this.encounterId = crypto.randomUUID();
      this.form.reset({ visit_date: todayIso(), reason: '', notes: '' });
      this.diagnoses.clear();
      this.diagnoses.push(this.newDiagnosis(true));
      this.form.markAsPristine();
      this.form.markAsUntouched();
      await this.queryClient.invalidateQueries({ queryKey: ['patient', this.patientId()] });
      this.saved.emit(outcome);
    } catch (e) {
      this.errorText.set((e as { message?: string }).message ?? 'Could not save the encounter.');
    } finally {
      this.saving.set(false);
    }
  }

  protected discardDraft() {
    this.clearDraft();
    this.draftRestored.set(false);
    this.form.reset({ visit_date: todayIso(), reason: '', notes: '' });
    this.diagnoses.clear();
    this.diagnoses.push(this.newDiagnosis(true));
  }

  // --- draft persistence ---------------------------------------------------

  private saveDraft() {
    try {
      if (!this.form.dirty) return;
      sessionStorage.setItem(draftKey(this.patientId()), JSON.stringify({ id: this.encounterId, value: this.form.getRawValue() }));
    } catch {
      // Storage unavailable or full: drafts are a convenience, never block entry.
    }
  }

  private restoreDraft(patientId: string) {
    try {
      const raw = sessionStorage.getItem(draftKey(patientId));
      if (!raw) return;
      const { id, value } = JSON.parse(raw);
      this.encounterId = id;
      this.diagnoses.clear();
      for (const d of value.diagnoses ?? []) {
        const g = this.newDiagnosis(!!d.is_primary);
        g.patchValue(d);
        this.diagnoses.push(g);
      }
      if (!this.diagnoses.length) this.diagnoses.push(this.newDiagnosis(true));
      this.form.patchValue({ visit_date: value.visit_date, reason: value.reason, notes: value.notes, vitals: value.vitals }, { emitEvent: false });
      this.draftRestored.set(true);
    } catch {
      // A corrupt draft is just ignored.
    }
  }

  private clearDraft() {
    try {
      sessionStorage.removeItem(draftKey(this.patientId()));
    } catch {
      // ignore
    }
  }
}
