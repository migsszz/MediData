import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DialogRef } from '@angular/cdk/dialog';
import { OfflineQueue } from '../../data/offline-queue';

/** Lists writes waiting to sync (or rejected by the server) with retry/discard. */
@Component({
  selector: 'app-sync-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="modal-box max-w-lg">
      <h2 class="text-lg font-bold">Sync status</h2>
      <p class="text-sm text-base-content/70 py-1">
        @if (!queue.online()) { You're offline. } 
        Changes made without a connection are saved on this device and sent automatically when you're back online.
      </p>
      @if (queue.items().length === 0) {
        <p class="py-6 text-center text-base-content/60">Everything is synced.</p>
      } @else {
        <ul class="flex flex-col gap-2 my-3">
          @for (i of queue.items(); track i.id) {
            <li class="border border-base-300 rounded-box p-3">
              <div class="flex items-start gap-2">
                <div class="flex-1">
                  <div class="font-medium">{{ i.label }}</div>
                  <div class="text-xs text-base-content/60">Saved {{ i.createdAt | date: 'short' }}</div>
                  @if (i.status === 'failed') {
                    <div class="text-error text-sm mt-1" role="alert">Not accepted: {{ i.error }}</div>
                  }
                </div>
                <span class="badge" [class.badge-warning]="i.status === 'pending'" [class.badge-error]="i.status === 'failed'">
                  {{ i.status === 'pending' ? 'Waiting' : 'Needs attention' }}
                </span>
              </div>
              <div class="flex justify-end gap-2 mt-2">
                @if (i.status === 'failed') {
                  <button type="button" class="btn btn-xs" (click)="queue.retry(i.id)">Retry</button>
                }
                <button type="button" class="btn btn-xs btn-ghost text-error" (click)="queue.discard(i.id)">Discard</button>
              </div>
            </li>
          }
        </ul>
      }
      <div class="modal-action">
        @if (queue.pendingCount() > 0) {
          <button type="button" class="btn" (click)="queue.flush()" [disabled]="queue.syncing()">
            {{ queue.syncing() ? 'Syncing…' : 'Sync now' }}
          </button>
        }
        <button type="button" class="btn btn-primary" (click)="ref.close()">Close</button>
      </div>
    </div>
  `
})
export class SyncPanelComponent {
  protected queue = inject(OfflineQueue);
  protected ref = inject(DialogRef<void, SyncPanelComponent>);
}
