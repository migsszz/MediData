import type { PatientCursor } from './clinical-api';

/** TanStack Query keys, in one place so invalidation can't drift from the queries. */
export const keys = {
  patients: (org: string, term: string) => ['patients', org, term] as const,
  patient: (id: string) => ['patient', id] as const,
  encounters: (patientId: string) => ['patient', patientId, 'encounters'] as const,
  diagnoses: (patientId: string, encounterIds: string[]) => ['patient', patientId, 'diagnoses', encounterIds] as const,
  observations: (patientId: string) => ['patient', patientId, 'observations'] as const,
  medications: (patientId: string) => ['patient', patientId, 'medications'] as const,
  allergies: (patientId: string) => ['patient', patientId, 'allergies'] as const,
  dashboard: (org: string) => ['dashboard', org] as const,
  hypertension: (org: string) => ['cohort', org, 'hypertension'] as const,
  overdue: (org: string) => ['cohort', org, 'overdue'] as const,
  members: (org: string) => ['members', org] as const,
  audit: (org: string) => ['audit', org] as const
};

export const cursorOf = (p: PatientCursor): PatientCursor => ({ last_name: p.last_name, first_name: p.first_name, id: p.id });
