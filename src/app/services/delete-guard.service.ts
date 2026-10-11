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
   * Resolves true if the caller should go ahead and archive the row.
   * Seeded demo rows can't be archived while still a guest: shows an info
   * popup instead and resolves false. Everything else (including seed rows
   * once upgraded to a full account) gets a normal confirm.
   *
   * "Archive" is a soft delete: the record is hidden from lists but kept,
   * with its audit history. Permanent removal is an admin-only database
   * operation, deliberately not offered in the app.
   */
  async confirmArchive(isSeed: boolean, label: string, detail?: string): Promise<boolean> {
    if (isSeed && this.supabase.isAnonymous()) {
      const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
        data: {
          title: "Can't archive sample data",
          message: `${label} is part of the demo's sample data and can't be archived while exploring as a guest. Upgrade to a full account to manage your own data freely.`,
          infoOnly: true
        }
      });
      await firstValueFrom(ref.closed);
      return false;
    }

    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: {
        title: 'Archive this?',
        message: `Archive ${label}? It will be hidden from lists but kept in the record history.${detail ? ` ${detail}` : ''}`,
        confirmText: 'Archive',
        danger: true
      }
    });
    const result = await firstValueFrom(ref.closed);
    return result === true;
  }
}
