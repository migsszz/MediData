import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'medidata-theme';
const DAISYUI_THEME: Record<ThemeMode, string> = {
  light: 'medidata-light',
  dark: 'medidata-dark'
};

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (e.g. private browsing) — fall through to system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(getInitialMode());

  constructor() {
    effect(() => {
      const mode = this.mode();
      document.documentElement.setAttribute('data-theme', DAISYUI_THEME[mode]);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Ignore write failures; theme just won't persist across reloads.
      }
    });
  }

  toggle() {
    this.mode.set(this.mode() === 'dark' ? 'light' : 'dark');
  }
}
