import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-upgrade-account-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './upgrade-account-dialog.component.html'
})
export class UpgradeAccountDialogComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);
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

    this.saving.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    this.success.set(true);
  }

  close() {
    this.dialogRef.close();
  }
}
