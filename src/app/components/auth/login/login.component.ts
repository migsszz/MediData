import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';
import { ClinicalApi } from '../../../data/clinical-api';
import { ThemeService } from '../../../services/theme.service';
import { IconComponent } from '../../ui/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IconComponent, ReactiveFormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);
  private api = inject(ClinicalApi);
  protected theme = inject(ThemeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = signal(false);
  demoLoading = signal(false);
  errorMessage = signal<string | null>(null);
  infoMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('reason') === 'idle'
      ? "You were signed out after 10 minutes of inactivity."
      : null
  );
  mode = signal<'signin' | 'signup'>('signin');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  toggleMode() {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.errorMessage.set(null);
    this.infoMessage.set(null);
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.infoMessage.set(null);

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
    this.infoMessage.set(null);

    const { data, error } = await this.supabase.signInAnonymously();

    if (error || !data.user) {
      this.demoLoading.set(false);
      this.errorMessage.set(error?.message ?? 'Demo mode is not available right now.');
      return;
    }

    try {
      // The server creates this guest's private workspace; seeding is one RPC.
      await this.api.seedDemoWorkspace();
      this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.errorMessage.set((err as { message?: string })?.message ?? 'Could not set up demo data.');
    } finally {
      this.demoLoading.set(false);
    }
  }
}
