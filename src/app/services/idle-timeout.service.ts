import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

const IDLE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/**
 * Signs the user out after IDLE_LIMIT_MS of no interaction, for both real
 * and guest sessions. This is a genuine sign-out (revokes the Supabase
 * session/refresh token via signOut()), not just a UI lock screen —
 * Supabase's own access-token auto-refresh has no concept of user
 * activity and would otherwise keep a forgotten, unattended tab logged in
 * indefinitely.
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private ngZone = inject(NgZone);
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private resetTimer = () => this.armTimer();

  /** Call once when an authenticated session begins (the app shell's lifetime). */
  start() {
    if (this.started) return;
    this.started = true;

    this.ngZone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) {
        document.addEventListener(event, this.resetTimer, { passive: true });
      }
      this.armTimer();
    });
  }

  /** Call when the authenticated session ends (shell destroyed, manual sign-out). */
  stop() {
    this.started = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.resetTimer);
    }
  }

  private armTimer() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.onIdle(), IDLE_LIMIT_MS);
  }

  private async onIdle() {
    this.stop();
    await this.supabase.signOut();
    this.ngZone.run(() => {
      this.router.navigate(['/login'], { queryParams: { reason: 'idle' } });
    });
  }
}
