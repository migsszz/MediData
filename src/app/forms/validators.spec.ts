import { FormControl, FormGroup } from '@angular/forms';
import { bloodPressurePair, bloodType, endNotBeforeStart, errorMessage, notInFuture, plausibleBirthDate, vitalRange } from './validators';

describe('form validators', () => {
  describe('vitalRange', () => {
    const v = vitalRange({ min: 40, max: 300 });
    it('accepts blank, in-range and boundary values', () => {
      for (const ok of [null, '', 40, 120, 300, '120']) expect(v(new FormControl(ok))).toBeNull();
    });
    it('rejects out-of-range values and reports the bounds', () => {
      expect(v(new FormControl(39))).toEqual({ range: { min: 40, max: 300, actual: 39 } });
      expect(v(new FormControl(301))?.['range']).toBeTruthy();
    });
    it('rejects non-numbers', () => {
      expect(v(new FormControl('abc'))).toEqual({ number: true });
    });
  });

  describe('dates', () => {
    const today = () => '2026-10-11';
    it('notInFuture allows today and the past only', () => {
      const v = notInFuture(today);
      expect(v(new FormControl('2026-10-11'))).toBeNull();
      expect(v(new FormControl('2020-01-01'))).toBeNull();
      expect(v(new FormControl('2026-10-12'))).toEqual({ future: true });
      expect(v(new FormControl(''))).toBeNull();
    });
    it('plausibleBirthDate rejects the future and implausibly old dates', () => {
      const v = plausibleBirthDate(today);
      expect(v(new FormControl('1990-05-05'))).toBeNull();
      expect(v(new FormControl('2027-01-01'))).toEqual({ future: true });
      expect(v(new FormControl('1800-01-01'))).toEqual({ tooOld: true });
    });
    it('endNotBeforeStart only complains when both are set and end < start', () => {
      const g = (start: string | null, end: string | null) =>
        new FormGroup({ start: new FormControl(start), end: new FormControl(end) }, { validators: endNotBeforeStart('start', 'end') });
      expect(g('2026-01-02', '2026-01-01').errors).toEqual({ endBeforeStart: true });
      expect(g('2026-01-01', '2026-01-01').errors).toBeNull();
      expect(g('2026-01-01', null).errors).toBeNull();
      expect(g(null, '2026-01-01').errors).toBeNull();
    });
  });

  describe('bloodPressurePair', () => {
    const g = (sys: number | null, dia: number | null) =>
      new FormGroup({ sys: new FormControl(sys), dia: new FormControl(dia) }, { validators: bloodPressurePair('sys', 'dia') });
    it('allows neither, requires both, and orders them', () => {
      expect(g(null, null).errors).toBeNull();
      expect(g(120, 80).errors).toBeNull();
      expect(g(120, null).errors).toEqual({ bpIncomplete: true });
      expect(g(null, 80).errors).toEqual({ bpIncomplete: true });
      expect(g(80, 120).errors).toEqual({ bpOrder: true });
      expect(g(80, 80).errors).toEqual({ bpOrder: true });
    });
  });

  it('bloodType accepts the eight types in any case and rejects others', () => {
    const v = bloodType();
    for (const ok of ['', null, 'O+', 'ab-', 'A+']) expect(v(new FormControl(ok))).toBeNull();
    for (const bad of ['C+', 'O', 'AB', '+']) expect(v(new FormControl(bad))).toEqual({ bloodType: true });
  });

  describe('errorMessage', () => {
    it('stays quiet until the control is touched', () => {
      const c = new FormControl('', { validators: [(x) => (x.value ? null : { required: true })] });
      c.updateValueAndValidity();
      expect(errorMessage(c, 'Name')).toBeNull();
      c.markAsTouched();
      expect(errorMessage(c, 'Name')).toBe('Name is required.');
    });
    it('describes range errors with their bounds', () => {
      const c = new FormControl(500, vitalRange({ min: 40, max: 300 }));
      c.markAsTouched();
      expect(errorMessage(c, 'Systolic BP')).toBe('Systolic BP should be between 40 and 300.');
    });
  });
});
