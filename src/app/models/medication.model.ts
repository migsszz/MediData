import type { Tables, TablesInsert } from '../data/database.types';

export type Medication = Tables<'medications'>;
export type MedicationInput = TablesInsert<'medications'>;
