import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Patient, PatientInput } from '../models/patient.model';

@Injectable({ providedIn: 'root' })
export class PatientService {
  constructor(private supabase: SupabaseService) {}

  private get table() {
    return this.supabase.client.from('patients');
  }

  list() {
    return from(
      this.table.select('*').order('last_name', { ascending: true }).then(({ data, error }) => {
        if (error) throw error;
        return data as Patient[];
      })
    );
  }

  get(id: string) {
    return from(
      this.table.select('*').eq('id', id).single().then(({ data, error }) => {
        if (error) throw error;
        return data as Patient;
      })
    );
  }

  create(input: PatientInput) {
    return from(
      this.table.insert(input).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Patient;
      })
    );
  }

  update(id: string, input: Partial<PatientInput>) {
    return from(
      this.table.update(input).eq('id', id).select().single().then(({ data, error }) => {
        if (error) throw error;
        return data as Patient;
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
