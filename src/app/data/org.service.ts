import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import { ClinicalApi } from './clinical-api';
import type { AppRole, Organization } from '../models/organization.model';

const ROLE_RANK: Record<AppRole, number> = { viewer: 0, clinician: 1, admin: 2 };

/**
 * The signed-in user's organization and role. Every query is scoped by
 * `orgId()`; the UI uses `can*()` only to hide controls (RLS enforces the
 * same rules in the database regardless).
 *
 * A user in several organizations gets their oldest one by default and can
 * switch with `select()`; the database default for new rows (current_org_id())
 * is the same oldest organization.
 */
@Injectable({ providedIn: 'root' })
export class OrgService {
  private supabase = inject(SupabaseService);
  private api = inject(ClinicalApi);

  readonly organizations = signal<Organization[]>([]);
  readonly roles = signal<Record<string, AppRole>>({});
  readonly selectedId = signal<string | null>(null);
  readonly loaded = signal(false);

  readonly org = computed(() => this.organizations().find((o) => o.id === this.selectedId()) ?? null);
  readonly orgId = computed(() => this.org()?.id ?? null);
  readonly role = computed<AppRole | null>(() => {
    const id = this.selectedId();
    return id ? (this.roles()[id] ?? null) : null;
  });
  readonly canWrite = computed(() => this.atLeast('clinician'));
  readonly isAdmin = computed(() => this.atLeast('admin'));

  constructor() {
    // Reload whenever the signed-in user changes (sign-in, sign-out, guest upgrade).
    let lastUser: string | null | undefined;
    this.supabase.session$.subscribe((session) => {
      const uid = session?.user.id ?? null;
      if (uid === lastUser) return;
      lastUser = uid;
      if (uid) void this.reload();
      else this.clear();
    });
  }

  async reload() {
    const [orgs, memberships] = await Promise.all([this.api.organizations(), this.api.myMemberships()]);
    const uid = this.supabase.currentSession?.user.id;
    const mine = memberships.filter((m) => m.user_id === uid);
    this.organizations.set(orgs.filter((o) => mine.some((m) => m.organization_id === o.id)));
    this.roles.set(Object.fromEntries(mine.map((m) => [m.organization_id, m.role])));
    if (!this.org() || !this.organizations().some((o) => o.id === this.selectedId())) {
      this.selectedId.set(this.organizations()[0]?.id ?? null);
    }
    this.loaded.set(true);
  }

  select(orgId: string) {
    if (this.organizations().some((o) => o.id === orgId)) this.selectedId.set(orgId);
  }

  private clear() {
    this.organizations.set([]);
    this.roles.set({});
    this.selectedId.set(null);
    this.loaded.set(false);
  }

  private atLeast(min: AppRole) {
    const r = this.role();
    return r !== null && ROLE_RANK[r] >= ROLE_RANK[min];
  }
}
