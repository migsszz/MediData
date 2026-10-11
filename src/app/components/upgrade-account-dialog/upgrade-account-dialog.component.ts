import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../services/supabase.service';
import { ClinicalApi } from '../../data/clinical-api';
import { OrgService } from '../../data/org.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-upgrade-account-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './upgrade-account-dialog.component.html'
})
export class UpgradeAccountDialogComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);
  private api = inject(ClinicalApi);
  private org = inject(OrgService);
  private dialog = inject(Dialog);
  private dialogRef = inject(DialogRef<void, UpgradeAccountDialogComponent>);

  saving = signal(false);
  errorMessage = signal<string | null>(null);
  success = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  async submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.supabase.upgradeToFullAccount(email!, password!);

    if (error) {
      this.saving.set(false);
      this.errorMessage.set(error.message);
      return;
    }

    await this.cleanUpDemoData();

    this.saving.set(false);
    this.success.set(true);
  }

  /**
   * Seeded demo rows never carry over to the new account: they're always
   * dropped. Anything the guest actually created themselves during the
   * session is kept unless they choose to discard it too. The database has
   * already promoted the workspace (or will, once the email is confirmed);
   * this just applies the choice.
   */
  private async cleanUpDemoData() {
    let keepUserCreatedData = true;
    try {
      const orgId = this.org.orgId();
      const hasOwnData = orgId ? await this.api.hasOwnPatients(orgId) : false;
      if (hasOwnData) {
        const dialogRef = this.dialog.open<boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Keep your demo session data?',
            message:
              "You added patient data during this demo session, separate from the sample patients. Keep it under your new account, or start fresh?",
            confirmText: 'Keep it',
            cancelText: 'Start fresh'
          }
        });
        const result = await firstValueFrom(dialogRef.closed);
        keepUserCreatedData = result ?? true;
      }
      await this.api.finishGuestUpgrade(keepUserCreatedData);
    } catch {
      // Non-fatal: the account upgrade itself already succeeded. Leftover
      // sample rows just won't have been cleaned up.
    }
  }

  close() {
    this.dialogRef.close();
  }
}
