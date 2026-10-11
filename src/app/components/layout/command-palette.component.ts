import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogRef } from '@angular/cdk/dialog';
import { ClinicalApi } from '../../data/clinical-api';
import { OrgService } from '../../data/org.service';
import { ThemeService, ThemeStyle } from '../../services/theme.service';
import { IconComponent } from '../ui/icon.component';
import type { Patient } from '../../models/patient.model';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

/**
 * Ctrl/Cmd+K: jump to a patient (server search) or run an action. Keyboard only
 * needs arrows + Enter; Escape closes (CDK Dialog handles that).
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="w-[min(36rem,92vw)] rounded-box border border-base-300 bg-base-100 shadow-2xl" role="dialog" aria-label="Command palette">
      <label class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
        <app-icon name="search" class="opacity-60" />
        <input
          class="w-full bg-transparent outline-none"
          placeholder="Search patients, or type a command…"
          aria-label="Search patients or run a command"
          role="combobox"
          [attr.aria-expanded]="true"
          [value]="term()"
          (input)="onInput($any($event.target).value)"
          (keydown)="onKey($event)"
        />
      </label>
      <ul class="menu max-h-80 w-full overflow-auto p-2 flex-nowrap" role="listbox">
        @for (c of results(); track c.id; let i = $index) {
          <li role="option" [attr.aria-selected]="i === active()">
            <button type="button" [class.menu-active]="i === active()" (mouseenter)="active.set(i)" (click)="choose(c)">
              <app-icon [name]="c.icon" />
              <span class="flex-1 text-left">{{ c.label }}</span>
              @if (c.hint) {
                <span class="text-xs opacity-60">{{ c.hint }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-sm text-base-content/60">Nothing matches “{{ term() }}”.</li>
        }
      </ul>
    </div>
  `
})
export class CommandPaletteComponent {
  private ref = inject(DialogRef<void, CommandPaletteComponent>);
  private router = inject(Router);
  private api = inject(ClinicalApi);
  private org = inject(OrgService);
  private theme = inject(ThemeService);

  protected term = signal('');
  protected active = signal(0);
  private patients = signal<Patient[]>([]);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  private go(path: string) {
    return () => void this.router.navigateByUrl(path);
  }

  private commands = computed<Command[]>(() => {
    const list: Command[] = [
      { id: 'dash', label: 'Go to Dashboard', icon: 'bar_chart', run: this.go('/dashboard') },
      { id: 'pts', label: 'Go to Patients', icon: 'groups', run: this.go('/patients') }
    ];
    if (this.org.canWrite()) list.push({ id: 'new', label: 'Add a patient', icon: 'add', run: this.go('/patients/new') });
    if (this.org.isAdmin()) list.push({ id: 'set', label: 'Practice settings', icon: 'settings', run: this.go('/settings') });
    list.push({ id: 'mode', label: this.theme.mode() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: 'palette', run: () => this.theme.toggle() });
    for (const s of this.theme.styles) {
      if (s.id !== this.theme.style()) list.push({ id: `style-${s.id}`, label: `Style: ${s.label}`, hint: s.blurb, icon: 'palette', run: () => this.theme.setStyle(s.id as ThemeStyle) });
    }
    return list;
  });

  protected results = computed<Command[]>(() => {
    const q = this.term().trim().toLowerCase();
    const people: Command[] = this.patients().map((p) => ({
      id: p.id,
      label: `${p.last_name}, ${p.first_name}`,
      hint: `DOB ${p.date_of_birth}`,
      icon: 'user',
      run: this.go(`/patients/${p.id}`)
    }));
    const cmds = q ? this.commands().filter((c) => c.label.toLowerCase().includes(q)) : this.commands();
    return [...people, ...cmds];
  });

  protected onInput(value: string) {
    this.term.set(value);
    this.active.set(0);
    if (this.timer) clearTimeout(this.timer);
    const org = this.org.orgId();
    if (!org || value.trim().length < 2) {
      this.patients.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      const mine = ++this.seq;
      const found = await this.api.searchPatients(org, value, null, 6).catch(() => []);
      if (mine === this.seq) this.patients.set(found);
    }, 180);
  }

  protected onKey(e: KeyboardEvent) {
    const n = this.results().length;
    if (!n) return;
    if (e.key === 'ArrowDown') {
      this.active.set((this.active() + 1) % n);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      this.active.set((this.active() + n - 1) % n);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.choose(this.results()[this.active()]);
    }
  }

  protected choose(c: Command) {
    this.ref.close();
    c.run();
  }
}
