import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';
import { environment } from '../environments/environment';

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    router.navigate(['/login']);
    return false;
  }

  const email = data.session.user.email?.toLowerCase();
  const allowed = environment.adminEmails.map(e => e.toLowerCase());
  if (!email || !allowed.includes(email)) {
    router.navigate(['/home']);
    return false;
  }
  return true;
};
