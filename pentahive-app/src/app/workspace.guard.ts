import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';

/**
 * Allows entry to /<workspace>/... only if the signed-in user has access to that
 * workspace per public.user_has_workspace(uid, code). Reads the workspace code from
 * route.data.workspace.
 */
export const workspaceGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const code = route.data['workspace'] as string | undefined;
  if (!code) {
    // Misconfigured route — fail closed.
    router.navigate(['/']);
    return false;
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) { router.navigate(['/login']); return false; }

  const { data, error } = await supabase.rpc('user_has_workspace', {
    p_user_id: session.session.user.id,
    p_workspace: code,
  });

  if (error || data !== true) {
    router.navigate(['/']);
    return false;
  }
  return true;
};
