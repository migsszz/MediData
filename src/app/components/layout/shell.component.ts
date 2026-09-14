import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Dialog } from '@angular/cdk/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { IdleTimeoutService } from '../../services/idle-timeout.service';
import { UpgradeAccountDialogComponent } from '../upgrade-account-dialog/upgrade-account-dialog.component';

const SIDEBAR_COLLAPSED_KEY = 'medidata-sidebar-collapsed';

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CdkTrapFocus],
  templateUrl: './shell.component.html'
})
export class ShellComponent implements OnInit, OnDestroy {
  private breakpointObserver = inject(BreakpointObserver);
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private idleTimeout = inject(IdleTimeoutService);
  protected theme = inject(ThemeService);
  protected isAnonymous = this.supabase.isAnonymous;

  ngOnInit() {
    this.idleTimeout.start();
  }

  ngOnDestroy() {
    this.idleTimeout.stop();
  }

  protected isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((result) => result.matches)),
    { initialValue: false }
  );

  collapsed = signal(getInitialCollapsed());
  mobileOpen = signal(false);

  toggleCollapsed() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Ignore write failures; the preference just won't persist across reloads.
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.mobileOpen()) {
      this.mobileOpen.set(false);
    }
  }

  async signOut() {
    this.idleTimeout.stop();
    await this.supabase.signOut();
    this.router.navigateByUrl('/login');
  }

  openUpgradeDialog() {
    this.dialog.open(UpgradeAccountDialogComponent);
  }
}
