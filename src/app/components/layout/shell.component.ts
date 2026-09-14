import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map, shareReplay } from 'rxjs';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
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
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private breakpointObserver = inject(BreakpointObserver);
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  protected theme = inject(ThemeService);
  protected isAnonymous = this.supabase.isAnonymous;

  isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
    map((result) => result.matches),
    shareReplay()
  );

  collapsed = signal(getInitialCollapsed());

  toggleCollapsed() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Ignore write failures; the preference just won't persist across reloads.
    }
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigateByUrl('/login');
  }

  openUpgradeDialog() {
    this.dialog.open(UpgradeAccountDialogComponent, { width: '400px' });
  }
}
