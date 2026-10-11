import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tiny inline trend line. Pure SVG so a chart per vital costs nothing. */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" class="h-10 w-full text-primary" role="img" [attr.aria-label]="label()">
      @if (bandRect(); as b) {
        <rect [attr.x]="0" [attr.width]="width()" [attr.y]="b.y" [attr.height]="b.h" class="text-success" fill="currentColor" fill-opacity="0.14" />
      }
      @if (points().length > 1) {
        <polyline [attr.points]="line()" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      }
      @if (last(); as p) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="currentColor" />
      }
    </svg>
  `
})
export class SparklineComponent {
  values = input.required<number[]>();
  label = input('Trend');
  /** Optional reference range shaded behind the line. */
  band = input<[number, number] | null>(null);
  width = input(200);
  height = input(40);

  private pad = 4;

  /** Value -> y, with the scale widened to include the band so it's always visible. */
  private scale = computed(() => {
    const v = this.values();
    const band = this.band();
    const lo = Math.min(...v, ...(band ? [band[0]] : []));
    const hi = Math.max(...v, ...(band ? [band[1]] : []));
    const span = hi - lo || 1;
    const h = this.height() - this.pad * 2;
    return (n: number) => this.pad + h - ((n - lo) / span) * h;
  });

  points = computed(() => {
    const v = this.values();
    if (!v.length) return [];
    const w = this.width() - this.pad * 2;
    const y = this.scale();
    return v.map((n, i) => ({ x: this.pad + (v.length === 1 ? w / 2 : (i / (v.length - 1)) * w), y: y(n) }));
  });

  bandRect = computed(() => {
    const band = this.band();
    if (!band || !this.values().length) return null;
    const y = this.scale();
    return { y: y(band[1]), h: Math.max(y(band[0]) - y(band[1]), 1) };
  });
  line = computed(() => this.points().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  last = computed(() => this.points().at(-1) ?? null);
}
