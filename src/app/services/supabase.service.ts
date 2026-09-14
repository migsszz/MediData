import { Injectable, computed, signal } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly session$ = new BehaviorSubject<Session | null>(null);

  /**
   * False until the initial getSession() call (which restores a persisted
   * session from localStorage on page load) has resolved. Guards must wait
   * for this instead of reading session$'s current value directly — on a
   * hard refresh, that value starts out null regardless of whether a
   * session is about to be restored, and racing ahead of it is what used
   * to bounce a still-logged-in user back to /login.
   */
  private readonly readySubject = new BehaviorSubject(false);
  readonly ready$ = this.readySubject.asObservable();

  private readonly sessionSignal = signal<Session | null>(null);
  readonly isAnonymous = computed(() => this.sessionSignal()?.user?.is_anonymous === true);

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

    this.client.auth.getSession().then(({ data }) => {
      this.session$.next(data.session);
      this.sessionSignal.set(data.session);
      this.readySubject.next(true);
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.session$.next(session);
      this.sessionSignal.set(session);
    });
  }

  get currentSession(): Session | null {
    return this.session$.value;
  }

  signInWithPassword(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  signUp(email: string, password: string) {
    return this.client.auth.signUp({ email, password });
  }

  /** Starts a guest/demo session backed by a real, isolated Supabase user (RLS-scoped to their own rows). */
  signInAnonymously() {
    return this.client.auth.signInAnonymously();
  }

  /**
   * Converts the current anonymous session into a full account by attaching an
   * email + password. Supabase flips `user.is_anonymous` to false once the
   * email is confirmed (immediately if email confirmations are disabled).
   */
  upgradeToFullAccount(email: string, password: string) {
    return this.client.auth.updateUser({ email, password });
  }

  signOut() {
    return this.client.auth.signOut();
  }
}
