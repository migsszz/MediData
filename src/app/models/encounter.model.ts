import type { Tables, TablesInsert } from '../data/database.types';

export type Encounter = Tables<'encounters'>;
export type EncounterInput = TablesInsert<'encounters'>;
export type EncounterDiagnosis = Tables<'encounter_diagnoses'>;
export type Observation = Tables<'observations'>;
export type ObservationType = Tables<'observation_types'>;

/** An encounter with its diagnoses and vitals joined in, as the chart shows it. */
export interface EncounterWithDetails extends Encounter {
  diagnoses: EncounterDiagnosis[];
  vitals: Observation[];
}
