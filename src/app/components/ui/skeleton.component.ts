import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shimmering placeholder rows shown while a list loads, so layout doesn't jump. */
@Component({
  selector: 'app-skeleton-rows',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2" aria-busy="true" [attr.aria-label]="label()">
      @for (i of rows(); track i) {
        <div class="skeleton-block" [style.height]="height()"></div>
      }
    </div>
  `
})
export class SkeletonRowsComponent {
  count = input(5);
  height = input('2.75rem');
  label = input('Loading');
  protected rows = () => Array.from({ length: this.count() }, (_, i) => i);
}
