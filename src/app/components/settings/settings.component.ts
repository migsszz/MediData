import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi } from '../../data/clinical-api';
import { OrgService } from '../../data/org.service';
import { keys } from '../../data/queries';
import type { AppRole } from '../../models/organization.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './settings.component.html'
})
export class SettingsComponent {
  private fb = inject(FormBuilder);
  private api = inject(ClinicalApi);
  private queryClient = inject(QueryClient);
  protected org = inject(OrgService);

  roles: AppRole[] = ['admin', 'clinician', 'viewer'];
  saving = signal(false);
  message = signal<{ ok: boolean; text: string } | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['clinician' as AppRole, Validators.required]
  });

  members = injectQuery(() => ({
    queryKey: keys.members(this.org.orgId() ?? ''),
    queryFn: () => this.api.members(this.org.orgId()!),
    enabled: !!this.org.orgId() && this.org.isAdmin()
  }));

  audit = injectQuery(() => ({
    queryKey: keys.audit(this.org.orgId() ?? ''),
    queryFn: () => this.api.auditLog(this.org.orgId()!, 50),
    enabled: !!this.org.orgId() && this.org.isAdmin()
  }));

  async addMember() {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.org.orgId()) return;
    this.saving.set(true);
    this.message.set(null);
    const { email, role } = this.form.getRawValue();
    try {
      await this.api.addMember(this.org.orgId()!, email!, role!);
      this.message.set({ ok: true, text: `${email} added as ${role}.` });
      this.form.reset({ email: '', role: 'clinician' });
      await this.queryClient.invalidateQueries({ queryKey: keys.members(this.org.orgId()!) });
    } catch (e) {
      this.message.set({ ok: false, text: (e as { message?: string }).message ?? 'Could not add that member.' });
    } finally {
      this.saving.set(false);
    }
  }
}
