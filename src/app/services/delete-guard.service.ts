import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class DeleteGuardService {
  private dialog = inject(Dialog);
  private supabase = inject(SupabaseService);

  /**
   * Resolves true if the caller should go ahead and delete the row.
   * Seeded demo rows can't be deleted while still a guest — shows an
   * info popup instead and resolves false. Everything else (including
   * seed rows once upgraded to a full account) gets a normal confirm.
   */
  async confirmDelete(isSeed: boolean, label: string, detail?: string): Promise<boolean> {
    if (isSeed && this.supabase.isAnonymous()) {
      const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
        data: {
          title: "Can't delete sample data",
          message: `${label} is part of the demo's sample data and can't be deleted while exploring as a guest. Upgrade to a full account to manage your own data freely.`,
          infoOnly: true
        }
      });
      await firstValueFrom(ref.closed);
      return false;
    }

    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Delete this?',
        message: `Delete ${label}? This can't be undone.${detail ? ` ${detail}` : ''}`,
        confirmText: 'Delete',
        danger: true
      }
    });
    const result = await firstValueFrom(ref.closed);
    return result === true;
  }
}
