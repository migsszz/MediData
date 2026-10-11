import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import type { VitalDef } from '../models/vitals';
import { todayIso } from '../util/age';

const isBlank = (v: unknown) => v === null || v === undefined || v === '';

/** Number within a vital sign's plausible range (mirrors observation_types in the database). */
export function vitalRange(def: Pick<VitalDef, 'min' | 'max'>): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (isBlank(c.value)) return null;
    const n = Number(c.value);
    if (!Number.isFinite(n)) return { number: true };
    return n < def.min || n > def.max ? { range: { min: def.min, max: def.max, actual: n } } : null;
  };
}

/** yyyy-mm-dd that isn't after today. */
export function notInFuture(today: () => string = todayIso): ValidatorFn {
  return (c) => (!isBlank(c.value) && String(c.value) > today() ? { future: true } : null);
}

/** Date of birth: not in the future and not absurdly old. */
export function plausibleBirthDate(today: () => string = todayIso): ValidatorFn {
  return (c) => {
    if (isBlank(c.value)) return null;
    const v = String(c.value);
    if (v > today()) return { future: true };
    const oldest = `${Number(today().slice(0, 4)) - 130}${today().slice(4)}`;
    return v < oldest ? { tooOld: true } : null;
  };
}

/** Group validator: `end` (if set) must not be before `start`. */
export function endNotBeforeStart(startKey: string, endKey: string): ValidatorFn {
  return (g) => {
    const start = g.get(startKey)?.value;
    const end = g.get(endKey)?.value;
    return !isBlank(start) && !isBlank(end) && String(end) < String(start) ? { endBeforeStart: true } : null;
  };
}

/** Group validator: blood pressure needs both numbers, and systolic must exceed diastolic. */
export function bloodPressurePair(sysKey: string, diaKey: string): ValidatorFn {
  return (g) => {
    const sys = g.get(sysKey)?.value;
    const dia = g.get(diaKey)?.value;
    if (isBlank(sys) && isBlank(dia)) return null;
    if (isBlank(sys) || isBlank(dia)) return { bpIncomplete: true };
    return Number(sys) <= Number(dia) ? { bpOrder: true } : null;
  };
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const BLOOD_TYPE_OPTIONS = BLOOD_TYPES;

export function bloodType(): ValidatorFn {
  return (c) => (isBlank(c.value) || BLOOD_TYPES.includes(String(c.value).toUpperCase()) ? null : { bloodType: true });
}

/** Human-readable message for the first error on a control, or null. */
export function errorMessage(c: AbstractControl | null, label = 'This field'): string | null {
  if (!c || !c.errors || !(c.touched || c.dirty)) return null;
  const e = c.errors;
  if (e['required']) return `${label} is required.`;
  if (e['email']) return 'Enter a valid email address.';
  if (e['range']) return `${label} should be between ${e['range'].min} and ${e['range'].max}.`;
  if (e['number']) return `${label} must be a number.`;
  if (e['future']) return `${label} can't be in the future.`;
  if (e['tooOld']) return `${label} looks too far in the past.`;
  if (e['bloodType']) return 'Use A, B, AB or O followed by + or -.';
  if (e['minlength']) return `${label} is too short.`;
  return `${label} is invalid.`;
}
