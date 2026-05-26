import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';

export const changePasswordGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    router.navigate(['/login']);
    return false;
  }
  if (data.session.user.user_metadata?.['must_change_password'] !== true) {
    router.navigate(['/home']);
    return false;
  }
  return true;
};
