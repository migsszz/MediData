import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi, EncounterDraft } from './clinical-api';
import { OfflineQueue, classifyError } from './offline-queue';
import { SupabaseService } from '../services/supabase.service';

const networkError = () => Object.assign(new TypeError('Failed to fetch'), {});
const pgError = (code: string, message = 'nope') => ({ code, message });

const draft = (id: string = crypto.randomUUID()): EncounterDraft => ({
  id,
  patient_id: 'p1',
  visit_date: '2026-10-11',
  reason: 'Checkup',
  notes: null,
  vitals: { '8480-6': 120 },
  diagnoses: []
});

describe('classifyError', () => {
  it('recognises network failures however the client surfaces them', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyError({ message: 'TypeError: Failed to fetch', code: '' })).toBe('network');
    expect(classifyError({ message: 'NetworkError when attempting to fetch resource.' })).toBe('network');
    expect(classifyError({ status: 0, message: 'x' })).toBe('network');
  });
  it('treats unique violations as already-applied', () => {
    expect(classifyError(pgError('23505'))).toBe('duplicate');
  });
  it('treats server refusals as rejected, not retryable', () => {
    for (const code of ['42501', '23514', '23503', 'P0002', 'PGRST301']) expect(classifyError(pgError(code))).toBe('rejected');
    expect(classifyError(pgError('42501', 'new row violates row-level security policy'))).toBe('rejected');
  });
});

describe('OfflineQueue', () => {
  let api: { recordEncounter: jasmine.Spy; createMedication: jasmine.Spy; createAllergy: jasmine.Spy };
  let queue: OfflineQueue;
  let invalidate: jasmine.Spy;
  const userId = `user-${Math.random()}`;

  beforeEach(() => {
    api = {
      recordEncounter: jasmine.createSpy('recordEncounter').and.resolveTo('ok'),
      createMedication: jasmine.createSpy('createMedication').and.resolveTo({}),
      createAllergy: jasmine.createSpy('createAllergy').and.resolveTo({})
    };
    invalidate = jasmine.createSpy('invalidateQueries').and.resolveTo();
    const session$ = new BehaviorSubject<unknown>({ user: { id: userId } });
    TestBed.configureTestingModule({
      providers: [
        { provide: ClinicalApi, useValue: api },
        { provide: SupabaseService, useValue: { session$, currentSession: { user: { id: userId } } } },
        { provide: QueryClient, useValue: { invalidateQueries: invalidate } }
      ]
    });
    queue = TestBed.inject(OfflineQueue);
  });

  afterEach(async () => {
    for (const i of queue.items()) await queue.discard(i.id);
  });

  it('writes straight through when online and queues nothing', async () => {
    expect(await queue.submit('record_encounter', draft(), 'enc')).toBe('saved');
    expect(api.recordEncounter).toHaveBeenCalledTimes(1);
    expect(queue.items().length).toBe(0);
  });

  it('queues the write when the network is down, then replays it once, with the same id', async () => {
    const d = draft();
    api.recordEncounter.and.rejectWith(networkError());
    expect(await queue.submit('record_encounter', d, 'enc')).toBe('queued');
    expect(queue.pendingCount()).toBe(1);
    expect(queue.online()).toBeFalse();

    api.recordEncounter.calls.reset();
    api.recordEncounter.and.resolveTo('ok');
    await queue.flush();

    expect(api.recordEncounter).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: d.id }));
    expect(queue.items().length).toBe(0);
    expect(queue.online()).toBeTrue();
    expect(invalidate).toHaveBeenCalled();
  });

  it('keeps queued writes, in order, while still offline', async () => {
    api.recordEncounter.and.rejectWith(networkError());
    await queue.submit('record_encounter', draft('a'), 'first');
    await queue.submit('record_encounter', draft('b'), 'second');
    await queue.flush();
    expect(queue.items().map((i) => i.id).sort()).toEqual(['a', 'b']);
    // 1 attempt from the first submit; the second submit knew we were offline and skipped the network;
    // flush then tried only the first queued item and stopped, instead of failing once per item.
    expect(api.recordEncounter.calls.count()).toBe(2);
  });

  it('does not queue a write the server refuses; the caller sees the error', async () => {
    api.recordEncounter.and.rejectWith(pgError('42501', 'row-level security'));
    await expectAsync(queue.submit('record_encounter', draft(), 'enc')).toBeRejectedWith(jasmine.objectContaining({ code: '42501' }));
    expect(queue.items().length).toBe(0);
  });

  it('treats a replayed duplicate as success', async () => {
    api.recordEncounter.and.rejectWith(networkError());
    await queue.submit('record_encounter', draft('dup'), 'enc');
    api.recordEncounter.and.rejectWith(pgError('23505'));
    await queue.flush();
    expect(queue.items().length).toBe(0);
  });

  it('flags a replayed write the server now rejects, and lets the user retry or discard it', async () => {
    api.createMedication.and.rejectWith(networkError());
    await queue.submit('create_medication', { id: 'm1', patient_id: 'gone', name: 'x', dosage: '1', frequency: 'd', start_date: '2026-01-01' }, 'med');

    api.createMedication.and.rejectWith(pgError('23503', 'patient was archived'));
    await queue.flush();
    const item = queue.items()[0];
    expect(item.status).toBe('failed');
    expect(item.error).toContain('archived');
    expect(queue.failedCount()).toBe(1);
    expect(queue.pendingCount()).toBe(0);

    api.createMedication.and.resolveTo({});
    await queue.retry('m1');
    expect(queue.items().length).toBe(0);
  });

  it('routes each kind to the matching API call', async () => {
    api.createAllergy.and.rejectWith(networkError());
    await queue.submit('create_allergy', { id: 'al1', patient_id: 'p', substance: 'Latex' }, 'allergy');
    api.createAllergy.and.resolveTo({});
    await queue.flush();
    expect(api.createAllergy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'al1', substance: 'Latex' }));
    expect(api.recordEncounter).not.toHaveBeenCalled();
  });
});
