import type { Sex } from './patient.model';

/** Shape of the JSON returned by the dashboard_stats() SQL function. */
export interface DashboardStats {
  total_patients: number;
  encounters_this_month: number;
  average_age: number;
  active_medications: number;
  encounters_by_month: { month: string; count: number }[];
  sex_distribution: { sex: Sex; count: number }[];
  top_diagnoses: { label: string; code: string | null; count: number }[];
  hypertension_count: number;
  overdue_followup_count: number;
}

export interface HypertensionCohortRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  systolic: number;
  diastolic: number | null;
  observed_at: string;
}

export interface OverdueFollowupRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  last_visit: string | null;
}
