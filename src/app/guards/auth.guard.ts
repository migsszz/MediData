import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  return supabase.ready$.pipe(
    filter((ready) => ready),
    take(1),
    map(() => (supabase.currentSession ? true : router.createUrlTree(['/login'])))
  );
};
