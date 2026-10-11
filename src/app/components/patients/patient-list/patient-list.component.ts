import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { injectInfiniteQuery, injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { ClinicalApi, PAGE_SIZE, PatientCursor } from '../../../data/clinical-api';
import { OrgService } from '../../../data/org.service';
import { cursorOf, keys } from '../../../data/queries';
import { DeleteGuardService } from '../../../services/delete-guard.service';
import type { Patient } from '../../../models/patient.model';
import { IconComponent } from '../../ui/icon.component';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { SkeletonRowsComponent } from '../../ui/skeleton.component';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [IconComponent, EmptyStateComponent, SkeletonRowsComponent, DatePipe, RouterLink],
  templateUrl: './patient-list.component.html'
})
export class PatientListComponent {
  private api = inject(ClinicalApi);
  protected org = inject(OrgService);
  private deleteGuard = inject(DeleteGuardService);
  private queryClient = inject(QueryClient);

  /** What the box shows vs. what we've actually searched for (debounced). */
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  protected term = signal('');

  // Search and paging are done by Postgres (search_patients, keyset on last/first/id).
  patients = injectInfiniteQuery(() => ({
    queryKey: keys.patients(this.org.orgId() ?? '', this.term()),
    initialPageParam: null as PatientCursor | null,
    queryFn: ({ pageParam }) => this.api.searchPatients(this.org.orgId()!, this.term(), pageParam),
    getNextPageParam: (last: Patient[]) => (last.length === PAGE_SIZE ? cursorOf(last[last.length - 1]) : undefined),
    enabled: !!this.org.orgId()
  }));

  rows = computed(() => this.patients.data()?.pages.flat() ?? []);

  archive = injectMutation(() => ({
    mutationFn: (id: string) => this.api.archivePatient(id),
    onSuccess: () => this.queryClient.invalidateQueries({ queryKey: ['patients'] })
  }));

  onSearchChange(value: string) {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.term.set(value.trim()), 250);
  }

  async archivePatient(p: Patient, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    const proceed = await this.deleteGuard.confirmArchive(
      p.is_seed,
      `${p.first_name} ${p.last_name}`,
      'Their encounters and medications are hidden with them.'
    );
    if (proceed) this.archive.mutate(p.id);
  }
}
