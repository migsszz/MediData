/** The measurements captured on an encounter, keyed by LOINC code (matches observation_types). */
export interface VitalDef {
  code: string;
  key: string;
  label: string;
  short: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Typical adult reference range, used only to shade charts and flag readings. Not diagnostic. */
  normal?: [number, number];
}

export const VITALS: VitalDef[] = [
  { code: '8480-6', key: 'systolic', label: 'Systolic BP', short: 'SBP', unit: 'mmHg', min: 40, max: 300, step: 1, normal: [90, 130] },
  { code: '8462-4', key: 'diastolic', label: 'Diastolic BP', short: 'DBP', unit: 'mmHg', min: 20, max: 200, step: 1, normal: [60, 85] },
  { code: '8867-4', key: 'heart_rate', label: 'Heart rate', short: 'HR', unit: 'bpm', min: 20, max: 300, step: 1, normal: [60, 100] },
  { code: '8310-5', key: 'temperature', label: 'Temperature', short: 'Temp', unit: '°C', min: 25, max: 45, step: 0.1, normal: [36.1, 37.8] },
  { code: '59408-5', key: 'spo2', label: 'SpO2', short: 'SpO2', unit: '%', min: 30, max: 100, step: 1, normal: [95, 100] },
  { code: '29463-7', key: 'weight', label: 'Weight', short: 'Wt', unit: 'kg', min: 0.3, max: 700, step: 0.1 },
  { code: '8302-2', key: 'height', label: 'Height', short: 'Ht', unit: 'cm', min: 20, max: 280, step: 0.1 }
];

export const VITAL_BY_CODE = new Map(VITALS.map((v) => [v.code, v]));
