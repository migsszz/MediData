import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../../data/clinical-api';
import { OfflineQueue } from '../../../data/offline-queue';
import type { Allergy } from '../../../models/allergy.model';
import { MedicationFormComponent } from './medication-form.component';

describe('MedicationFormComponent', () => {
  let fixture: ComponentFixture<MedicationFormComponent>;
  let queue: { submit: jasmine.Spy };

  const penicillin = { id: 'a1', substance: 'Penicillin', rxcui: null, active: true, deleted_at: null, severity: 'severe', category: 'drug' } as Allergy;
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(async () => {
    queue = { submit: jasmine.createSpy('submit').and.resolveTo('saved') };
    await TestBed.configureTestingModule({
      imports: [MedicationFormComponent],
      providers: [
        { provide: ClinicalApi, useValue: { searchDrugs: () => Promise.resolve([]) } },
        { provide: OfflineQueue, useValue: queue },
        { provide: QueryClient, useValue: { invalidateQueries: () => Promise.resolve() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(MedicationFormComponent);
    fixture.componentRef.setInput('patientId', 'p1');
    fixture.componentRef.setInput('allergies', [penicillin]);
    fixture.detectChanges();
  });

  function fill(name: string) {
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const set = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input')); };
    set(inputs[0], name);                               // typeahead: medication name
    set(fixture.nativeElement.querySelector('#med-dose'), '500mg');
    set(fixture.nativeElement.querySelector('#med-freq'), 'Twice daily');
    fixture.detectChanges();
  }

  it('saves a drug with no allergy conflict', async () => {
    fill('Metformin');
    expect(q('[role=alert].alert-warning')).toBeNull();
    (q('button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(queue.submit).toHaveBeenCalledOnceWith('create_medication', jasmine.objectContaining({ name: 'Metformin', patient_id: 'p1', dosage: '500mg' }), jasmine.any(String));
  });

  it('blocks a conflicting drug until the clinician explicitly overrides', async () => {
    fill('Penicillin V');
    expect(q('[role=alert].alert-warning')?.textContent).toContain('Penicillin');
    const save = q('button[type=submit]') as HTMLButtonElement;
    expect(save.disabled).toBeTrue();

    const box = q('input[type=checkbox]') as HTMLInputElement;
    box.click();
    fixture.detectChanges();
    expect(save.disabled).toBeFalse();
    save.click();
    await fixture.whenStable();
    expect(queue.submit).toHaveBeenCalled();
  });

  it('refuses an end date before the start date', () => {
    fill('Metformin');
    const set = (sel: string, v: string) => { const el = q(sel) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event('input')); };
    set('#med-start', '2026-05-02');
    set('#med-end', '2026-05-01');
    fixture.detectChanges();
    expect(q('form')?.textContent).toContain("End date can't be before the start date");
    (q('button[type=submit]') as HTMLButtonElement).click();
    expect(queue.submit).not.toHaveBeenCalled();
  });
});
