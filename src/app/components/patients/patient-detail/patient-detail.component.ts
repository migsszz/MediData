import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../../data/clinical-api';
import { OrgService } from '../../../data/org.service';
import { keys } from '../../../data/queries';
import { DeleteGuardService } from '../../../services/delete-guard.service';
import { ageFromDob } from '../../../util/age';
import { VITALS, VITAL_BY_CODE } from '../../../models/vitals';
import type { Encounter, EncounterWithDetails } from '../../../models/encounter.model';
import type { Medication } from '../../../models/medication.model';
import type { Allergy } from '../../../models/allergy.model';
import { SparklineComponent } from '../../ui/sparkline.component';
import { EncounterFormComponent } from '../chart/encounter-form.component';
import { MedicationFormComponent } from '../chart/medication-form.component';
import { AllergyFormComponent } from '../chart/allergy-form.component';

type Tab = 'timeline' | 'medications' | 'allergies';
type TimelineItem =
  | { kind: 'encounter'; date: string; encounter: EncounterWithDetails }
  | { kind: 'med-start' | 'med-stop'; date: string; medication: Medication };

interface VitalTrend {
  code: string;
  label: string;
  unit: string;
  values: number[];
  latest: string;
  delta: number | null;
  /** The reading's date, so a stale value is visibly stale. */
  at: string;
}

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, SparklineComponent, EncounterFormComponent, MedicationFormComponent, AllergyFormComponent],
  templateUrl: './patient-detail.component.html'
})
export class PatientDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ClinicalApi);
  private deleteGuard = inject(DeleteGuardService);
  private queryClient = inject(QueryClient);
  protected org = inject(OrgService);

  protected patientId = this.route.snapshot.paramMap.get('id')!;

  activeTab = signal<Tab>('timeline');
  form = signal<'encounter' | 'medication' | 'allergy' | null>(null);
  notice = signal<string | null>(null);

  patient = injectQuery(() => ({ queryKey: keys.patient(this.patientId), queryFn: () => this.api.getPatient(this.patientId) }));
  encounters = injectQuery(() => ({ queryKey: keys.encounters(this.patientId), queryFn: () => this.api.listEncounters(this.patientId) }));
  observations = injectQuery(() => ({ queryKey: keys.observations(this.patientId), queryFn: () => this.api.listObservations(this.patientId) }));
  medications = injectQuery(() => ({ queryKey: keys.medications(this.patientId), queryFn: () => this.api.listMedications(this.patientId) }));
  allergies = injectQuery(() => ({ queryKey: keys.allergies(this.patientId), queryFn: () => this.api.listAllergies(this.patientId) }));
  diagnoses = injectQuery(() => {
    const ids = (this.encounters.data() ?? []).map((e) => e.id);
    return {
      queryKey: keys.diagnoses(this.patientId, ids),
      queryFn: () => this.api.listDiagnoses(ids),
      enabled: this.encounters.isSuccess()
    };
  });

  age = computed(() => {
    const p = this.patient.data();
    return p ? ageFromDob(p.date_of_birth) : null;
  });

  activeAllergies = computed(() => (this.allergies.data() ?? []).filter((a) => a.active));
  severeAllergies = computed(() => this.activeAllergies().filter((a) => a.severity === 'severe'));
  activeMedications = computed(() =>
    (this.medications.data() ?? []).filter((m) => m.active && (!m.end_date || m.end_date >= new Date().toISOString().slice(0, 10)))
  );

  encountersDetailed = computed<EncounterWithDetails[]>(() => {
    const dx = this.diagnoses.data() ?? [];
    const obs = this.observations.data() ?? [];
    return (this.encounters.data() ?? []).map((e) => ({
      ...e,
      diagnoses: dx.filter((d) => d.encounter_id === e.id),
      vitals: obs.filter((o) => o.encounter_id === e.id)
    }));
  });

  timeline = computed<TimelineItem[]>(() => {
    const items: TimelineItem[] = this.encountersDetailed().map((encounter) => ({ kind: 'encounter', date: encounter.visit_date, encounter }));
    for (const m of this.medications.data() ?? []) {
      items.push({ kind: 'med-start', date: m.start_date, medication: m });
      if (m.end_date) items.push({ kind: 'med-stop', date: m.end_date, medication: m });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  });

  /** One trend per vital that has data; blood pressure is shown as a single systolic/diastolic card. */
  trends = computed<VitalTrend[]>(() => {
    const obs = this.observations.data() ?? [];
    const out: VitalTrend[] = [];
    for (const def of VITALS) {
      if (def.key === 'diastolic' || def.key === 'height') continue;
      const series = obs.filter((o) => o.type_code === def.code);
      if (!series.length) continue;
      const last = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : null;
      let latest = `${last.value}`;
      if (def.key === 'systolic') {
        const dia = obs.filter((o) => o.type_code === '8462-4' && o.encounter_id === last.encounter_id).at(-1);
        if (dia) latest = `${last.value}/${dia.value}`;
      }
      out.push({
        code: def.code,
        label: def.key === 'systolic' ? 'Blood pressure' : def.label,
        unit: def.unit,
        values: series.map((o) => o.value),
        latest,
        delta: prev ? Math.round((last.value - prev.value) * 10) / 10 : null,
        at: last.observed_at
      });
    }
    return out;
  });

  vitalLabel(code: string) {
    return VITAL_BY_CODE.get(code);
  }

  vitalsSummary(e: EncounterWithDetails): string[] {
    const by = new Map(e.vitals.map((v) => [v.type_code, v.value]));
    const parts: string[] = [];
    if (by.has('8480-6') && by.has('8462-4')) parts.push(`BP ${by.get('8480-6')}/${by.get('8462-4')}`);
    else if (by.has('8480-6')) parts.push(`SBP ${by.get('8480-6')}`);
    for (const def of VITALS.filter((v) => !['systolic', 'diastolic'].includes(v.key))) {
      if (by.has(def.code)) parts.push(`${def.short} ${by.get(def.code)} ${def.unit}`);
    }
    return parts;
  }

  onSaved(outcome: 'saved' | 'queued', what: string) {
    this.form.set(null);
    this.notice.set(outcome === 'queued' ? `${what} saved on this device. It will sync when you're back online.` : `${what} saved.`);
    setTimeout(() => this.notice.set(null), 5000);
  }

  private invalidate = () => this.queryClient.invalidateQueries({ queryKey: ['patient', this.patientId] });

  archivePatientMutation = injectMutation(() => ({
    mutationFn: () => this.api.archivePatient(this.patientId),
    onSuccess: async () => {
      await this.queryClient.invalidateQueries({ queryKey: ['patients'] });
      this.router.navigateByUrl('/patients');
    }
  }));
  archiveEncounterMutation = injectMutation(() => ({ mutationFn: (id: string) => this.api.archiveEncounter(id), onSuccess: this.invalidate }));
  archiveMedicationMutation = injectMutation(() => ({ mutationFn: (id: string) => this.api.archiveMedication(id), onSuccess: this.invalidate }));
  archiveAllergyMutation = injectMutation(() => ({ mutationFn: (id: string) => this.api.archiveAllergy(id), onSuccess: this.invalidate }));

  async archivePatient() {
    const p = this.patient.data();
    if (!p) return;
    const ok = await this.deleteGuard.confirmArchive(p.is_seed, `${p.first_name} ${p.last_name}`, 'Their encounters, medications and allergies are hidden with them.');
    if (ok) this.archivePatientMutation.mutate();
  }

  async archiveEncounter(e: Encounter) {
    if (await this.deleteGuard.confirmArchive(e.is_seed, `the encounter from ${e.visit_date}`)) this.archiveEncounterMutation.mutate(e.id);
  }

  async archiveMedication(m: Medication) {
    if (await this.deleteGuard.confirmArchive(m.is_seed, m.name)) this.archiveMedicationMutation.mutate(m.id);
  }

  async archiveAllergy(a: Allergy) {
    if (await this.deleteGuard.confirmArchive(false, `the ${a.substance} allergy`)) this.archiveAllergyMutation.mutate(a.id);
  }
}
