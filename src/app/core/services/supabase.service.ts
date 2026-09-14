import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly session$ = new BehaviorSubject<Session | null>(null);

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

    this.client.auth.getSession().then(({ data }) => {
      this.session$.next(data.session);
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.session$.next(session);
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

  signOut() {
    return this.client.auth.signOut();
  }
}
