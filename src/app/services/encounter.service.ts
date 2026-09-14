import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Encounter, EncounterInput } from '../models/encounter.model';

@Injectable({ providedIn: 'root' })
export class EncounterService {
  constructor(private supabase: SupabaseService) {}

  private get table() {
    return this.supabase.client.from('encounters');
  }

  listAll() {
    return from(
      this.table.select('*').order('visit_date', { ascending: false }).then(({ data, error }) => {
        if (error) throw error;
        return data as Encounter[];
      })
    );
  }

  listForPatient(patientId: string) {
    return from(
      this.table
        .select('*')
        .eq('patient_id', patientId)
        .order('visit_date', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return data as Encounter[];
        })
    );
  }

  create(input: EncounterInput) {
    return from(
      this.table.insert(input).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Encounter;
      })
    );
  }

  update(id: string, input: Partial<EncounterInput>) {
    return from(
      this.table.update(input).eq('id', id).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Encounter;
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
