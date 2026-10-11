import type { Allergy } from '../models/allergy.model';

/**
 * Active allergies that plausibly conflict with a drug: same RxNorm id, or one
 * name containing the other (so "Penicillin V" trips a "Penicillin" allergy).
 * This is a safety net for typos and free text, not a clinical decision-support
 * engine: it knows nothing about drug classes or cross-reactivity.
 */
export function findAllergyConflicts(drugName: string, rxcui: string | null, allergies: Allergy[]): Allergy[] {
  const name = drugName.trim().toLowerCase();
  if (!name && !rxcui) return [];
  return allergies.filter((a) => {
    if (!a.active || a.deleted_at) return false;
    if (rxcui && a.rxcui === rxcui) return true;
    const substance = a.substance.trim().toLowerCase();
    return !!name && !!substance && (name.includes(substance) || substance.includes(name));
  });
}
