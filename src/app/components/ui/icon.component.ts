import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ICONS } from './icons';

/**
 * Inline SVG icon. Stroke weight comes from the active style (--icon-stroke) and
 * size from the surrounding font size, so icons follow the theme without per-use classes.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 align-middle', 'aria-hidden': 'true' },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    [attr.width]="size()"
    [attr.height]="size()"
    [style.stroke-width]="'var(--icon-stroke, 2)'"
    [innerHTML]="markup()"
  ></svg>`
})
export class IconComponent {
  name = input.required<string>();
  /** CSS size, e.g. '1.25em' (default) or '20'. */
  size = input('1.25em');

  private sanitizer = inject(DomSanitizer);
  // The markup comes from our own static ICONS table, never user input.
  protected markup = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()] ?? ''));
}
