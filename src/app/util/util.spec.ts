import { ageFromDob, todayIso } from './age';
import { findAllergyConflicts } from './allergy-check';
import { toCsv } from './csv';
import type { Allergy } from '../models/allergy.model';

describe('ageFromDob', () => {
  const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);
  it('counts whole years, not yet incremented before the birthday', () => {
    expect(ageFromDob('1990-06-15', on(2026, 6, 14))).toBe(35);
    expect(ageFromDob('1990-06-15', on(2026, 6, 15))).toBe(36);
    expect(ageFromDob('1990-06-15', on(2026, 12, 31))).toBe(36);
  });
  it('is not thrown off by month ordering', () => {
    expect(ageFromDob('2000-12-31', on(2026, 1, 1))).toBe(25);
  });
  it('todayIso formats local dates with zero padding', () => {
    expect(todayIso(on(2026, 3, 5))).toBe('2026-03-05');
  });
});

describe('findAllergyConflicts', () => {
  const allergy = (over: Partial<Allergy>): Allergy =>
    ({ id: 'a', substance: 'Penicillin', rxcui: null, active: true, deleted_at: null, severity: 'severe', category: 'drug', ...over }) as Allergy;

  it('matches by RxNorm id', () => {
    expect(findAllergyConflicts('Pen VK', '7980', [allergy({ rxcui: '7980', substance: 'x' })]).length).toBe(1);
  });
  it('matches by name in either direction, ignoring case', () => {
    expect(findAllergyConflicts('penicillin v', null, [allergy({})]).length).toBe(1);
    expect(findAllergyConflicts('Pen', null, [allergy({ substance: 'Pen' })]).length).toBe(1);
    expect(findAllergyConflicts('PENICILLIN', null, [allergy({ substance: 'Penicillin V' })]).length).toBe(1);
  });
  it('ignores inactive and archived allergies and unrelated drugs', () => {
    expect(findAllergyConflicts('Penicillin', null, [allergy({ active: false })])).toEqual([]);
    expect(findAllergyConflicts('Penicillin', null, [allergy({ deleted_at: '2026-01-01' })])).toEqual([]);
    expect(findAllergyConflicts('Metformin', '6809', [allergy({})])).toEqual([]);
  });
  it('returns nothing for an empty drug', () => {
    expect(findAllergyConflicts('  ', null, [allergy({})])).toEqual([]);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['l1\nl2', null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"l1\nl2",\r\n');
  });
  it('neutralises spreadsheet formulas but leaves numbers alone', () => {
    expect(toCsv(['n'], [['=HYPERLINK("x")'], ['+1'], ['@cmd'], [-5], ['-x']])).toBe(
      `n\r\n"'=HYPERLINK(""x"")"\r\n'+1\r\n'@cmd\r\n-5\r\n'-x\r\n`
    );
  });
});
