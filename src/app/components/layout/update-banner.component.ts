import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UpdateService } from '../../services/update.service';
import { IconComponent } from '../ui/icon.component';

/** "New version available" prompt, shown on every page (including login) once an update is downloaded. */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (update.updateReady()) {
      <div role="status" class="fixed bottom-4 left-1/2 z-[60] flex w-[min(28rem,92vw)] -translate-x-1/2 items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
        <app-icon name="refresh_cw" class="text-primary" />
        <span class="flex-1 text-sm">A new version of MediData is ready.</span>
        <button type="button" class="btn btn-primary btn-sm" (click)="update.applyUpdate()">Reload</button>
      </div>
    }
  `
})
export class UpdateBannerComponent {
  protected update = inject(UpdateService);
}
