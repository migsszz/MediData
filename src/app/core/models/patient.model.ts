export type Sex = 'male' | 'female' | 'other' | 'unknown';

export interface Patient {
  id: string;
  created_at: string;
  created_by: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: Sex;
  phone: string | null;
  email: string | null;
  address: string | null;
  blood_type: string | null;
  allergies: string | null;
  notes: string | null;
}

export type PatientInput = Omit<Patient, 'id' | 'created_at' | 'created_by'>;
