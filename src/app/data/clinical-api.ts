import { Injectable, inject } from '@angular/core';
import type { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase.service';
import type { Json } from './database.types';
import type { Patient, PatientInput } from '../models/patient.model';
import type { Encounter, EncounterDiagnosis, Observation, ObservationType } from '../models/encounter.model';
import type { Medication, MedicationInput } from '../models/medication.model';
import type { Allergy, AllergyInput } from '../models/allergy.model';
import type {
  DashboardStats,
  HypertensionCohortRow,
  OverdueFollowupRow
} from '../models/dashboard.model';
import type { AppRole, AuditEntry, Membership, Organization } from '../models/organization.model';

/** Unwraps a Supabase response: returns `data`, or throws the PostgREST error. */
async function run<T>(query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

/** Same, for queries with nothing to return. */
async function exec(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await query;
  if (error) throw error;
}

export const PAGE_SIZE = 25;

export interface PatientCursor {
  last_name: string;
  first_name: string;
  id: string;
}

export interface EncounterDraft {
  /** Client-generated so a retried save (e.g. from the offline queue) is idempotent. */
  id: string;
  patient_id: string;
  visit_date: string;
  reason: string;
  notes: string | null;
  /** LOINC code -> value, e.g. {"8480-6": 120}. */
  vitals: Record<string, number>;
  diagnoses: { icd10_code: string | null; description: string; is_primary: boolean }[];
}

/**
 * The app's single data-access layer: one typed method per operation, no
 * per-entity service classes. Reads are plain promises meant to be wrapped by
 * TanStack Query; writes are what the offline queue replays.
 *
 * Every read of a clinical table filters `deleted_at is null` here, in one
 * place, because RLS deliberately lets members see archived rows (an archiving
 * UPDATE must be able to read its own result).
 */
@Injectable({ providedIn: 'root' })
export class ClinicalApi {
  private db = inject(SupabaseService).client;

  // --- patients ----------------------------------------------------------

  searchPatients(org: string, query: string, after?: PatientCursor | null, limit = PAGE_SIZE) {
    return run(
      this.db.rpc('search_patients', {
        p_org: org,
        p_query: query.trim() || null,
        p_limit: limit,
        p_after_last: after?.last_name ?? null,
        p_after_first: after?.first_name ?? null,
        p_after_id: after?.id ?? null
      })
    ) as Promise<Patient[]>;
  }

  getPatient(id: string) {
    return run(this.db.from('patients').select('*').eq('id', id).is('deleted_at', null).single()) as Promise<Patient>;
  }

  createPatient(input: PatientInput) {
    return run(this.db.from('patients').insert(input).select().single()) as Promise<Patient>;
  }

  updatePatient(id: string, patch: Partial<PatientInput>) {
    return run(this.db.from('patients').update(patch).eq('id', id).select().single()) as Promise<Patient>;
  }

  archivePatient(id: string) {
    return exec(this.db.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  // --- encounters, vitals, diagnoses ---------------------------------------

  listEncounters(patientId: string) {
    return run(
      this.db.from('encounters').select('*').eq('patient_id', patientId).is('deleted_at', null)
        .order('visit_date', { ascending: false })
    ) as Promise<Encounter[]>;
  }

  listDiagnoses(encounterIds: string[]) {
    if (!encounterIds.length) return Promise.resolve([] as EncounterDiagnosis[]);
    return run(
      this.db.from('encounter_diagnoses').select('*').in('encounter_id', encounterIds).is('deleted_at', null)
        .order('is_primary', { ascending: false })
    ) as Promise<EncounterDiagnosis[]>;
  }

  /** Atomic + idempotent: see supabase/migrations/*_record_encounter.sql. */
  recordEncounter(d: EncounterDraft) {
    return run(
      this.db.rpc('record_encounter', {
        p_id: d.id,
        p_patient_id: d.patient_id,
        p_visit_date: d.visit_date,
        p_reason: d.reason,
        p_notes: d.notes,
        p_vitals: d.vitals as Json,
        p_diagnoses: d.diagnoses as unknown as Json
      })
    );
  }

  archiveEncounter(id: string) {
    return exec(this.db.from('encounters').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  listObservations(patientId: string) {
    return run(
      this.db.from('observations').select('*').eq('patient_id', patientId).is('deleted_at', null)
        .order('observed_at', { ascending: true })
    ) as Promise<Observation[]>;
  }

  // --- medications ---------------------------------------------------------

  listMedications(patientId: string) {
    return run(
      this.db.from('medications').select('*').eq('patient_id', patientId).is('deleted_at', null)
        .order('start_date', { ascending: false })
    ) as Promise<Medication[]>;
  }

  createMedication(input: MedicationInput) {
    return run(this.db.from('medications').insert(input).select().single()) as Promise<Medication>;
  }

  archiveMedication(id: string) {
    return exec(this.db.from('medications').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  // --- allergies -----------------------------------------------------------

  listAllergies(patientId: string) {
    return run(
      this.db.from('allergies').select('*').eq('patient_id', patientId).is('deleted_at', null)
        .order('created_at', { ascending: true })
    ) as Promise<Allergy[]>;
  }

  createAllergy(input: AllergyInput) {
    return run(this.db.from('allergies').insert(input).select().single()) as Promise<Allergy>;
  }

  archiveAllergy(id: string) {
    return exec(this.db.from('allergies').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  // --- reference data ------------------------------------------------------

  observationTypes() {
    return run(this.db.from('observation_types').select('*').order('code')) as Promise<ObservationType[]>;
  }

  searchIcd10(term: string) {
    const q = term.trim();
    if (q.length < 2) return Promise.resolve([] as { code: string; description: string }[]);
    return run(
      this.db.from('icd10_codes').select('*').or(`code.ilike.${q}%,description.ilike.%${q}%`).order('code').limit(8)
    );
  }

  searchDrugs(term: string) {
    const q = term.trim();
    if (q.length < 2) return Promise.resolve([] as { rxcui: string; name: string }[]);
    return run(this.db.from('rxnorm_drugs').select('*').ilike('name', `%${q}%`).order('name').limit(8));
  }

  // --- analytics -----------------------------------------------------------

  dashboard(org: string) {
    return run(this.db.rpc('dashboard_stats', { p_org: org })) as unknown as Promise<DashboardStats>;
  }

  hypertensionCohort(org: string) {
    return run(this.db.rpc('cohort_hypertension', { p_org: org })) as Promise<HypertensionCohortRow[]>;
  }

  overdueFollowups(org: string, months = 12) {
    return run(this.db.rpc('cohort_overdue_followups', { p_org: org, p_months: months })) as Promise<OverdueFollowupRow[]>;
  }

  // --- organization, members, audit ------------------------------------------

  myMemberships() {
    return run(this.db.from('memberships').select('*').order('created_at')) as Promise<Membership[]>;
  }

  organizations() {
    return run(this.db.from('organizations').select('*').order('created_at')) as Promise<Organization[]>;
  }

  members(org: string) {
    return run(this.db.from('memberships').select('*').eq('organization_id', org)) as Promise<Membership[]>;
  }

  addMember(org: string, email: string, role: AppRole) {
    return exec(this.db.rpc('add_member_by_email', { org, member_email: email, member_role: role }));
  }

  auditLog(org: string, limit = 50) {
    return run(
      this.db.from('audit_log').select('*').eq('organization_id', org).order('at', { ascending: false }).limit(limit)
    ) as Promise<AuditEntry[]>;
  }

  // --- demo workspace ------------------------------------------------------

  seedDemoWorkspace() {
    return exec(this.db.rpc('seed_demo_workspace'));
  }

  finishGuestUpgrade(keepOwnData: boolean) {
    return exec(this.db.rpc('finish_guest_upgrade', { keep_own_data: keepOwnData }));
  }

  /** True if the guest added any patient beyond the seeded sample set. */
  async hasOwnPatients(org: string) {
    const { count, error } = await this.db
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
      .eq('is_seed', false)
      .is('deleted_at', null);
    if (error) throw error;
    return (count ?? 0) > 0;
  }
}
