import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';
import { DemoDataService } from '../../../services/demo-data.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);
  private demoData = inject(DemoDataService);
  private router = inject(Router);

  loading = signal(false);
  demoLoading = signal(false);
  errorMessage = signal<string | null>(null);
  mode = signal<'signin' | 'signup'>('signin');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  toggleMode() {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.errorMessage.set(null);
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();
    const action =
      this.mode() === 'signin'
        ? this.supabase.signInWithPassword(email!, password!)
        : this.supabase.signUp(email!, password!);

    const { error } = await action;
    this.loading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    if (this.mode() === 'signin') {
      this.router.navigateByUrl('/dashboard');
    } else {
      this.errorMessage.set('Check your email to confirm your account, then sign in.');
      this.mode.set('signin');
    }
  }

  async tryDemo() {
    this.demoLoading.set(true);
    this.errorMessage.set(null);

    const { data, error } = await this.supabase.signInAnonymously();

    if (error || !data.user) {
      this.demoLoading.set(false);
      this.errorMessage.set(error?.message ?? 'Demo mode is not available right now.');
      return;
    }

    this.demoData.seedDemoData(data.user.id).subscribe({
      next: () => {
        this.demoLoading.set(false);
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.demoLoading.set(false);
        this.errorMessage.set(err?.message ?? 'Could not set up demo data.');
      }
    });
  }
}
