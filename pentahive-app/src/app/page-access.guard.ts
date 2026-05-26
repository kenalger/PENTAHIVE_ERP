import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';

// Route-level access check using the DB's public.can_enter_page() RPC.
// Attach `data: { pageCode: 'sales-orders' }` to each protected route; the guard
// reads it, hits Supabase, and either allows or redirects to /dashboard.
export const pageAccessGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const pageCode = route.data['pageCode'] as string | undefined;

  if (!pageCode) {
    // No pageCode means the route author forgot to set it. Fail closed.
    router.navigate(['/dashboard']);
    return false;
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) { router.navigate(['/login']); return false; }

  const { data, error } = await supabase.rpc('can_enter_page', {
    p_user_id: session.session.user.id,
    p_page_code: pageCode,
  });

  if (error || data !== true) {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
