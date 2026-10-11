import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
export type ThemeStyle = 'editorial' | 'utilitarian' | 'friendly';

export interface StyleInfo {
  id: ThemeStyle;
  label: string;
  blurb: string;
  /** Swatch for the picker: [light accent, ink, surface]. Static so the picker can preview styles that aren't active. */
  swatch: [string, string, string];
}

export const STYLES: StyleInfo[] = [
  { id: 'editorial', label: 'Editorial', blurb: 'Calm, warm paper tones and serif headings', swatch: ['#1f5f5b', '#26231f', '#fdfbf7'] },
  { id: 'utilitarian', label: 'Utilitarian', blurb: 'Dense, monochrome, built for speed', swatch: ['#243447', '#16191d', '#f1f3f5'] },
  { id: 'friendly', label: 'Friendly', blurb: 'Soft, rounded and approachable', swatch: ['#1fa396', '#3a3340', '#fdf6ee'] }
];

/** Colours the canvas charts need as concrete values (they can't read CSS classes). */
export interface ChartColors {
  primary: string;
  secondary: string;
  accent: string;
  info: string;
  text: string;
  grid: string;
}

const MODE_KEY = 'medidata-theme';
const STYLE_KEY = 'medidata-style';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // localStorage unavailable (e.g. private browsing)
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore write failures; the choice just won't persist across reloads.
  }
}

export function initialMode(stored: string | null, prefersDark: boolean): ThemeMode {
  return stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
}

export function initialStyle(stored: string | null): ThemeStyle {
  return STYLES.some((s) => s.id === stored) ? (stored as ThemeStyle) : 'editorial';
}

/** The DaisyUI theme name for a style + mode (defined in styles.css). */
export const themeName = (style: ThemeStyle, mode: ThemeMode) => `${style}-${mode}`;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly styles = STYLES;
  readonly mode = signal<ThemeMode>(initialMode(read(MODE_KEY), window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
  readonly style = signal<ThemeStyle>(initialStyle(read(STYLE_KEY)));
  readonly chartColors = signal<ChartColors>({ primary: '#1f5f5b', secondary: '#8a5a44', accent: '#a15c38', info: '#2b6a8a', text: '#26231f', grid: '#e6dfd2' });

  constructor() {
    effect(() => {
      const mode = this.mode();
      const style = this.style();
      const root = document.documentElement;
      root.setAttribute('data-theme', themeName(style, mode));
      root.setAttribute('data-style', style);
      write(MODE_KEY, mode);
      write(STYLE_KEY, style);
      this.chartColors.set(this.readChartColors());
    });
  }

  toggle() {
    this.mode.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  setStyle(style: ThemeStyle) {
    this.style.set(style);
  }

  private readChartColors(): ChartColors {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      primary: v('--color-primary', '#1f5f5b'),
      secondary: v('--color-secondary', '#8a5a44'),
      accent: v('--color-accent', '#a15c38'),
      info: v('--color-info', '#2b6a8a'),
      text: v('--color-base-content', '#26231f'),
      grid: v('--color-base-300', '#e6dfd2')
    };
  }
}
