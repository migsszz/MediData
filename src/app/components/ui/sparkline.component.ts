import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tiny inline trend line. Pure SVG so a chart per vital costs nothing. */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" class="w-full h-10 text-primary" role="img" [attr.aria-label]="label()">
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
  width = input(120);
  height = input(40);

  points = computed(() => {
    const v = this.values();
    if (!v.length) return [];
    const pad = 4;
    const w = this.width() - pad * 2;
    const h = this.height() - pad * 2;
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((n, i) => ({
      x: pad + (v.length === 1 ? w / 2 : (i / (v.length - 1)) * w),
      y: pad + h - ((n - min) / span) * h
    }));
  });
  line = computed(() => this.points().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  last = computed(() => this.points().at(-1) ?? null);
}
