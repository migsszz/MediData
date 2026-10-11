import type { Tables, TablesInsert } from '../data/database.types';

export type AllergyCategory = 'drug' | 'food' | 'environment' | 'other';
export type AllergySeverity = 'mild' | 'moderate' | 'severe';
export const ALLERGY_CATEGORIES: AllergyCategory[] = ['drug', 'food', 'environment', 'other'];
export const ALLERGY_SEVERITIES: AllergySeverity[] = ['mild', 'moderate', 'severe'];

type Narrowed = { category: AllergyCategory; severity: AllergySeverity };
export type Allergy = Omit<Tables<'allergies'>, keyof Narrowed> & Narrowed;
export type AllergyInput = Omit<TablesInsert<'allergies'>, keyof Narrowed> & Partial<Narrowed>;
