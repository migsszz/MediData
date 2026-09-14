import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Medication, MedicationInput } from '../models/medication.model';

@Injectable({ providedIn: 'root' })
export class MedicationService {
  constructor(private supabase: SupabaseService) {}

  private get table() {
    return this.supabase.client.from('medications');
  }

  listForPatient(patientId: string) {
    return from(
      this.table
        .select('*')
        .eq('patient_id', patientId)
        .order('start_date', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return data as Medication[];
        })
    );
  }

  create(input: MedicationInput) {
    return from(
      this.table.insert(input).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Medication;
      })
    );
  }

  update(id: string, input: Partial<MedicationInput>) {
    return from(
      this.table.update(input).eq('id', id).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Medication;
      })
    );
  }

  delete(id: string) {
    return from(
      this.table.delete().eq('id', id).then(({ error }) => {
        if (error) throw error;
      })
    );
  }
}
