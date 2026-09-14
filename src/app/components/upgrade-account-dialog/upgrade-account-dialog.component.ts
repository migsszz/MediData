import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-upgrade-account-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './upgrade-account-dialog.component.html',
  styleUrl: './upgrade-account-dialog.component.scss'
})
export class UpgradeAccountDialogComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);
  private dialogRef = inject(MatDialogRef<UpgradeAccountDialogComponent>);

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
