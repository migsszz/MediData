export interface Medication {
  id: string;
  created_at: string;
  created_by: string | null;
  is_seed: boolean;
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

export type MedicationInput = Omit<Medication, 'id' | 'created_at' | 'created_by' | 'is_seed'>;
