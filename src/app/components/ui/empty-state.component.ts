import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Friendly empty state: an icon, what's missing, why, and (projected) the one action to take. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span class="grid h-14 w-14 place-items-center rounded-full bg-base-300/60 text-base-content/60">
        <app-icon [name]="icon()" size="1.6em" />
      </span>
      <p class="mt-1 text-base font-semibold">{{ title() }}</p>
      @if (hint()) {
        <p class="max-w-sm text-sm text-base-content/60">{{ hint() }}</p>
      }
      <div class="mt-2"><ng-content /></div>
    </div>
  `
})
export class EmptyStateComponent {
  icon = input('info');
  title = input.required<string>();
  hint = input('');
}
