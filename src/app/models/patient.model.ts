import type { Tables, TablesInsert } from '../data/database.types';

export type Sex = 'male' | 'female' | 'other' | 'unknown';
export const SEX_OPTIONS: Sex[] = ['female', 'male', 'other', 'unknown'];

export type Patient = Omit<Tables<'patients'>, 'sex'> & { sex: Sex };
export type PatientInput = Omit<TablesInsert<'patients'>, 'sex'> & { sex: Sex };
