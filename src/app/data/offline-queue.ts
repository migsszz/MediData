import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { SupabaseService } from '../services/supabase.service';
import { ClinicalApi, EncounterDraft } from './clinical-api';
import { openStore } from './idb';
import type { MedicationInput } from '../models/medication.model';
import type { AllergyInput } from '../models/allergy.model';

export type QueuedKind = 'record_encounter' | 'create_medication' | 'create_allergy';

export interface QueuedWrite {
  id: string;
  userId: string;
  kind: QueuedKind;
  payload: unknown;
  /** Shown in the sync panel, e.g. "Encounter 2026-10-11 for Ava Thompson". */
  label: string;
  createdAt: number;
  attempts: number;
  /** 'pending' retries automatically; 'failed' needs a person (see `error`). */
  status: 'pending' | 'failed';
  error?: string;
}

export type ErrorClass = 'network' | 'duplicate' | 'rejected';

/**
 * - network:   couldn't reach the server; keep the write and retry later.
 * - duplicate: unique violation on replay; the earlier attempt already landed.
 * - rejected:  the server understood and said no (RLS, validation, patient
 *              gone); retrying unchanged won't help, so surface it.
 */
export function classifyError(e: unknown): ErrorClass {
  const err = e as { code?: string; message?: string; status?: number; name?: string } | null;
  if (err?.code === '23505') return 'duplicate';
  const msg = String(err?.message ?? '');
  if (
    err instanceof TypeError ||
    err?.status === 0 ||
    (err?.code === '' || err?.code === undefined) && /failed to fetch|network|load failed|fetch failed/i.test(msg)
  ) {
    return 'network';
  }
  return 'rejected';
}

const RETRY_INTERVAL_MS = 30_000;

/**
 * Durable write queue for the creates a clinician does at the point of care
 * (encounters, medications, allergies) so a dropped connection doesn't lose
 * work. Writes carry client-generated ids, so replaying one is idempotent.
 *
 * Deliberately limited: edits and archives need a connection (there is no
 * silent last-write-wins on clinical records). Queued items are stored in
 * IndexedDB in plain text, scoped to the user who made them, and are NOT
 * cleared on sign-out (an idle timeout must not destroy unsynced work); they
 * are sent the next time that same user signs in. See README, "Offline".
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueue {
  private api = inject(ClinicalApi);
  private supabase = inject(SupabaseService);
  private queryClient = inject(QueryClient);
  private store = openStore<QueuedWrite>('medidata-offline', 'writes');

  readonly items = signal<QueuedWrite[]>([]);
  readonly pendingCount = computed(() => this.items().filter((i) => i.status === 'pending').length);
  readonly failedCount = computed(() => this.items().filter((i) => i.status === 'failed').length);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly syncing = signal(false);

  private flushing: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online.set(true);
        void this.flush();
      });
      window.addEventListener('offline', () => this.online.set(false));
      setInterval(() => {
        if (this.pendingCount() > 0) void this.flush();
      }, RETRY_INTERVAL_MS);
    }
    this.supabase.session$.subscribe((session) => {
      if (session) void this.load().then(() => this.flush());
      else this.items.set([]);
    });
  }

  /**
   * Performs the write now if possible, otherwise queues it.
   * Resolves 'saved' or 'queued'; rejects only if the server refused it.
   */
  async submit<T extends { id: string }>(kind: QueuedKind, payload: T, label: string): Promise<'saved' | 'queued'> {
    if (this.online()) {
      try {
        await this.execute(kind, payload);
        return 'saved';
      } catch (e) {
        const c = classifyError(e);
        if (c === 'duplicate') return 'saved';
        if (c === 'rejected') throw e;
        this.online.set(false);
      }
    }
    await this.enqueue(kind, payload, label);
    return 'queued';
  }

  flush(): Promise<void> {
    return (this.flushing ??= this.doFlush().finally(() => (this.flushing = null)));
  }

  async retry(id: string) {
    await this.update(id, { status: 'pending', error: undefined });
    await this.flush();
  }

  async discard(id: string) {
    await this.store.remove(id);
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  private async doFlush() {
    if (!this.online() && typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = this.items().filter((i) => i.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
    if (!queue.length) return;

    this.syncing.set(true);
    let wroteAny = false;
    try {
      for (const item of queue) {
        try {
          await this.execute(item.kind, item.payload);
          await this.discard(item.id);
          wroteAny = true;
        } catch (e) {
          const c = classifyError(e);
          if (c === 'duplicate') {
            await this.discard(item.id);
            wroteAny = true;
          } else if (c === 'network') {
            this.online.set(false);
            return; // still offline; keep order and try again later
          } else {
            await this.update(item.id, {
              status: 'failed',
              attempts: item.attempts + 1,
              error: (e as { message?: string })?.message ?? 'The server rejected this change.'
            });
          }
        }
      }
      this.online.set(true);
    } finally {
      this.syncing.set(false);
      if (wroteAny) void this.queryClient.invalidateQueries();
    }
  }

  private execute(kind: QueuedKind, payload: unknown): Promise<unknown> {
    switch (kind) {
      case 'record_encounter':
        return this.api.recordEncounter(payload as EncounterDraft);
      case 'create_medication':
        return this.api.createMedication(payload as MedicationInput);
      case 'create_allergy':
        return this.api.createAllergy(payload as AllergyInput);
    }
  }

  private async enqueue<T extends { id: string }>(kind: QueuedKind, payload: T, label: string) {
    const userId = this.supabase.currentSession?.user.id;
    if (!userId) throw new Error('Not signed in');
    const item: QueuedWrite = {
      id: payload.id,
      userId,
      kind,
      payload,
      label,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending'
    };
    await this.store.put(item);
    this.items.update((list) => [...list.filter((i) => i.id !== item.id), item]);
  }

  private async update(id: string, patch: Partial<QueuedWrite>) {
    const current = this.items().find((i) => i.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    await this.store.put(next);
    this.items.update((list) => list.map((i) => (i.id === id ? next : i)));
  }

  private async load() {
    const userId = this.supabase.currentSession?.user.id;
    const all = await this.store.all();
    this.items.set(all.filter((i) => i.userId === userId));
  }
}
