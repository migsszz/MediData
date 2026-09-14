export interface Encounter {
  id: string;
  created_at: string;
  created_by: string | null;
  is_seed: boolean;
  patient_id: string;
  visit_date: string;
  reason: string;
  diagnosis: string | null;
  notes: string | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  temperature_c: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  spo2: number | null;
}

export type EncounterInput = Omit<Encounter, 'id' | 'created_at' | 'created_by' | 'is_seed'>;
