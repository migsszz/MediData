/**
 * Database types, shaped like the output of `supabase gen types typescript`.
 *
 * Maintained by hand from supabase/migrations/ so the app type-checks without
 * a live database. Once you have a project (or `supabase start` locally),
 * regenerate it and the compiler will tell you where the app has drifted:
 *
 *   npm run gen:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Meta = {
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

/** Row plus the Insert/Update shapes PostgREST accepts: `Req` keys are required on insert. */
type TableDef<Row, Req extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Req> & Partial<Omit<Row, Req>>;
  Update: Partial<Row>;
  Relationships: [];
};

// Postgres enum -> union, as the generator emits it. Text columns guarded only by a
// CHECK constraint (sex, allergy category/severity, audit action) come out as `string`;
// src/app/models narrows them.
type AppRole = 'admin' | 'clinician' | 'viewer';

type PatientRow = Meta & {
  id: string;
  organization_id: string;
  is_seed: boolean;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  blood_type: string | null;
  notes: string | null;
};

export type Database = {
  public: {
    Tables: {
      organizations: TableDef<{ id: string; created_at: string; name: string; is_demo: boolean }, 'name'>;
      memberships: TableDef<
        { organization_id: string; user_id: string; role: AppRole; created_at: string },
        'organization_id' | 'user_id'
      >;
      patients: TableDef<PatientRow, 'first_name' | 'last_name' | 'date_of_birth' | 'sex'>;
      encounters: TableDef<
        Meta & {
          id: string;
          organization_id: string;
          is_seed: boolean;
          patient_id: string;
          visit_date: string;
          reason: string;
          notes: string | null;
        },
        'patient_id' | 'visit_date' | 'reason'
      >;
      medications: TableDef<
        Meta & {
          id: string;
          organization_id: string;
          is_seed: boolean;
          patient_id: string;
          name: string;
          rxcui: string | null;
          dosage: string;
          frequency: string;
          start_date: string;
          end_date: string | null;
          active: boolean;
        },
        'patient_id' | 'name' | 'dosage' | 'frequency' | 'start_date'
      >;
      observations: TableDef<
        Meta & {
          id: string;
          organization_id: string;
          patient_id: string;
          encounter_id: string | null;
          type_code: string;
          value: number;
          observed_at: string;
        },
        'patient_id' | 'type_code' | 'value'
      >;
      allergies: TableDef<
        Meta & {
          id: string;
          organization_id: string;
          patient_id: string;
          substance: string;
          rxcui: string | null;
          category: string;
          severity: string;
          reaction: string | null;
          active: boolean;
        },
        'patient_id' | 'substance'
      >;
      encounter_diagnoses: TableDef<
        Meta & {
          id: string;
          organization_id: string;
          encounter_id: string;
          icd10_code: string | null;
          description: string;
          is_primary: boolean;
        },
        'encounter_id' | 'description'
      >;
      observation_types: TableDef<
        { code: string; display: string; unit: string; min_value: number; max_value: number },
        'code'
      >;
      icd10_codes: TableDef<{ code: string; description: string }, 'code' | 'description'>;
      rxnorm_drugs: TableDef<{ rxcui: string; name: string }, 'rxcui' | 'name'>;
      audit_log: TableDef<{
        id: number;
        at: string;
        actor: string | null;
        organization_id: string;
        table_name: string;
        record_id: string;
        action: string;
        old_data: Json | null;
        new_data: Json | null;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      search_patients: {
        Args: {
          p_org: string;
          p_query?: string | null;
          p_limit?: number;
          p_after_last?: string | null;
          p_after_first?: string | null;
          p_after_id?: string | null;
        };
        Returns: PatientRow[];
      };
      dashboard_stats: { Args: { p_org: string }; Returns: Json };
      cohort_hypertension: {
        Args: { p_org: string };
        Returns: {
          patient_id: string;
          first_name: string;
          last_name: string;
          systolic: number;
          diastolic: number | null;
          observed_at: string;
        }[];
      };
      cohort_overdue_followups: {
        Args: { p_org: string; p_months?: number };
        Returns: { patient_id: string; first_name: string; last_name: string; last_visit: string | null }[];
      };
      record_encounter: {
        Args: {
          p_id: string;
          p_patient_id: string;
          p_visit_date: string;
          p_reason: string;
          p_notes?: string | null;
          p_vitals?: Json;
          p_diagnoses?: Json;
        };
        Returns: string;
      };
      seed_demo_workspace: { Args: Record<PropertyKey, never>; Returns: undefined };
      finish_guest_upgrade: { Args: { keep_own_data: boolean }; Returns: undefined };
      add_member_by_email: {
        Args: { org: string; member_email: string; member_role?: AppRole };
        Returns: undefined;
      };
    };
    Enums: { app_role: AppRole };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
