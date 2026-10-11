import { TestBed } from '@angular/core/testing';
import { ThemeService, initialMode, initialStyle, themeName } from './theme.service';

describe('theme helpers', () => {
  it('uses a stored mode, else the system preference', () => {
    expect(initialMode('dark', false)).toBe('dark');
    expect(initialMode('light', true)).toBe('light');
    expect(initialMode(null, true)).toBe('dark');
    expect(initialMode('garbage', false)).toBe('light');
  });
  it('uses a stored style, else editorial', () => {
    expect(initialStyle('friendly')).toBe('friendly');
    expect(initialStyle(null)).toBe('editorial');
    expect(initialStyle('neon')).toBe('editorial');
  });
  it('names themes style-mode, matching the DaisyUI themes in styles.css', () => {
    expect(themeName('utilitarian', 'dark')).toBe('utilitarian-dark');
  });
});

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    root.removeAttribute('data-theme');
    root.removeAttribute('data-style');
    localStorage.clear();
  });

  it('applies data-theme and data-style to <html> and persists the choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.mode.set('dark');
    theme.setStyle('utilitarian');
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('utilitarian-dark');
    expect(root.getAttribute('data-style')).toBe('utilitarian');
    expect(localStorage.getItem('medidata-style')).toBe('utilitarian');
    expect(localStorage.getItem('medidata-theme')).toBe('dark');
  });

  it('toggle() flips light and dark without changing the style', () => {
    const theme = TestBed.inject(ThemeService);
    theme.mode.set('light');
    theme.setStyle('friendly');
    theme.toggle();
    expect(theme.mode()).toBe('dark');
    expect(theme.style()).toBe('friendly');
  });

  it('refreshes chart colours from the active theme', () => {
    const theme = TestBed.inject(ThemeService);
    const probe = document.createElement('style');
    probe.textContent = `[data-style='friendly'] { --color-primary: rgb(1, 2, 3); }`;
    document.head.appendChild(probe);
    theme.setStyle('friendly');
    TestBed.tick();
    expect(theme.chartColors().primary).toBe('rgb(1, 2, 3)');
    probe.remove();
  });
});
