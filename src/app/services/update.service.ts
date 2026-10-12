import { Injectable, NgZone, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

const CHECK_EVERY_MS = 30 * 60 * 1000;
/** A new version found this soon after load is applied silently, if the user hasn't started interacting. */
const AUTO_APPLY_WINDOW_MS = 15_000;

/**
 * Keeps installed copies of the app current.
 *
 * Angular's service worker serves the cached build first and, by default, only looks for a new
 * deploy after a quiet spell, then uses it on the *next* load. In practice that means the old
 * version keeps appearing after a deploy (and a hard reload only helps once). This service:
 *  - checks for a new version at startup, every 30 minutes, and whenever the tab becomes visible
 *  - applies it immediately if the user hasn't touched anything yet
 *  - otherwise raises `updateReady` so the UI can offer a reload (never reloads mid-typing)
 *
 * Reloading is safe for unsynced work: the offline queue lives in IndexedDB and encounter
 * drafts in sessionStorage, both of which survive a reload.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  // Optional: only provided when the service worker is configured (not in unit tests or other hosts).
  private sw = inject(SwUpdate, { optional: true });
  private zone = inject(NgZone);

  /** True when a newer version is downloaded and waiting for the user to reload. */
  readonly updateReady = signal(false);

  private startedAt = Date.now();
  private interacted = false;

  constructor() {
    const sw = this.sw;
    if (!sw?.isEnabled) return; // dev server, no service worker configured, or unsupported browser

    const markInteracted = () => (this.interacted = true);
    for (const e of ['keydown', 'pointerdown']) window.addEventListener(e, markInteracted, { once: true, passive: true });

    sw.versionUpdates.pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')).subscribe(() => this.onVersionReady());
    // The worker's caches are inconsistent (e.g. a half-applied deploy): the only fix is a fresh load.
    sw.unrecoverable.subscribe(() => this.reloadPage());

    void this.check();
    // Timers and listeners outside Angular so they don't hold the app "unstable" (which delays
    // service worker registration) or trigger change detection when nothing changed.
    this.zone.runOutsideAngular(() => {
      setInterval(() => void this.check(), CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void this.check());
    });
  }

  /** Asks the worker to fetch the latest manifest now. Failures (offline) are fine: we try again later. */
  async check() {
    try {
      await this.sw?.checkForUpdate();
    } catch {
      // offline or transient network error
    }
  }

  /** Switches to the downloaded version and reloads. Bound to the banner's button. */
  async applyUpdate() {
    try {
      await this.sw?.activateUpdate();
    } finally {
      this.reloadPage();
    }
  }

  private onVersionReady() {
    const early = Date.now() - this.startedAt < AUTO_APPLY_WINDOW_MS && !this.interacted;
    if (early) void this.applyUpdate();
    else this.zone.run(() => this.updateReady.set(true));
  }

  /** Separate so tests can observe it without navigating the test runner. */
  protected reloadPage() {
    document.location.reload();
  }
}
