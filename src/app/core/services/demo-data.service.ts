import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { PatientInput } from '../models/patient.model';
import { EncounterInput } from '../models/encounter.model';
import { MedicationInput } from '../models/medication.model';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const DEMO_PATIENTS: Omit<PatientInput, 'created_by'>[] = [
  {
    first_name: 'Ava',
    last_name: 'Thompson',
    date_of_birth: '1985-03-12',
    sex: 'female',
    phone: '555-0101',
    email: 'ava.thompson@example.com',
    address: '12 Maple St',
    blood_type: 'O+',
    allergies: 'Penicillin',
    notes: 'Demo patient.'
  },
  {
    first_name: 'Liam',
    last_name: 'Garcia',
    date_of_birth: '1972-11-02',
    sex: 'male',
    phone: '555-0102',
    email: 'liam.garcia@example.com',
    address: '48 Oak Ave',
    blood_type: 'A-',
    allergies: null,
    notes: 'Demo patient.'
  },
  {
    first_name: 'Noor',
    last_name: 'Haddad',
    date_of_birth: '1998-07-22',
    sex: 'female',
    phone: '555-0103',
    email: 'noor.haddad@example.com',
    address: '7 Birch Ln',
    blood_type: 'B+',
    allergies: 'Latex',
    notes: 'Demo patient.'
  },
  {
    first_name: 'Ethan',
    last_name: 'Walker',
    date_of_birth: '1960-01-30',
    sex: 'male',
    phone: '555-0104',
    email: 'ethan.walker@example.com',
    address: '901 Pine Rd',
    blood_type: 'AB+',
    allergies: null,
    notes: 'Demo patient.'
  },
  {
    first_name: 'Sofia',
    last_name: 'Rossi',
    date_of_birth: '2001-09-15',
    sex: 'female',
    phone: '555-0105',
    email: 'sofia.rossi@example.com',
    address: '23 Cedar Ct',
    blood_type: 'O-',
    allergies: 'Ibuprofen',
    notes: 'Demo patient.'
  }
];

const DIAGNOSES = ['Hypertension', 'Type 2 diabetes', 'Seasonal allergies', 'Common cold', 'Migraine'];
const REASONS = ['Annual checkup', 'Follow-up visit', 'Acute symptoms', 'Prescription refill', 'Lab review'];

@Injectable({ providedIn: 'root' })
export class DemoDataService {
  constructor(private supabase: SupabaseService) {}

  /** Seeds a small, self-contained patient/encounter/medication dataset owned by the given (anonymous) user. */
  seedDemoData(userId: string) {
    const patients = DEMO_PATIENTS.map((p) => ({ ...p, created_by: userId }));

    return from(
      this.supabase.client.from('patients').insert(patients).select().then(({ data, error }) => {
        if (error) throw error;
        return data as { id: string }[];
      })
    ).pipe(
      switchMap((insertedPatients) => {
        const encounters: EncounterInput[] = [];
        const medications: MedicationInput[] = [];

        insertedPatients.forEach((patient, i) => {
          const visitsForPatient = 2 + (i % 3);
          for (let v = 0; v < visitsForPatient; v++) {
            encounters.push({
              patient_id: patient.id,
              visit_date: daysAgo(v * 30 + i * 5),
              reason: REASONS[(i + v) % REASONS.length],
              diagnosis: DIAGNOSES[(i + v) % DIAGNOSES.length],
              notes: 'Seeded demo encounter.',
              blood_pressure_systolic: 110 + ((i + v) % 6) * 5,
              blood_pressure_diastolic: 70 + ((i + v) % 4) * 4,
              heart_rate: 60 + ((i + v) % 8) * 3,
              temperature_c: 36.5 + ((i + v) % 3) * 0.2,
              weight_kg: 60 + i * 6 + v,
              height_cm: 160 + i * 3,
              spo2: 96 + ((i + v) % 4)
            } as EncounterInput);
          }

          if (i % 2 === 0) {
            medications.push({
              patient_id: patient.id,
              name: i === 0 ? 'Lisinopril' : 'Metformin',
              dosage: i === 0 ? '10mg' : '500mg',
              frequency: 'Once daily',
              start_date: daysAgo(60),
              end_date: null,
              active: true
            } as MedicationInput);
          }
        });

        const encountersWithOwner = encounters.map((e) => ({ ...e, created_by: userId }));
        const medicationsWithOwner = medications.map((m) => ({ ...m, created_by: userId }));

        return from(
          Promise.all([
            this.supabase.client.from('encounters').insert(encountersWithOwner),
            this.supabase.client.from('medications').insert(medicationsWithOwner)
          ]).then(([encRes, medRes]) => {
            if (encRes.error) throw encRes.error;
            if (medRes.error) throw medRes.error;
          })
        );
      })
    );
  }
}
