// manage-access — admin-only Edge Function for the access-control system.
//
// Model: developer-defined access bundles. The catalog (access_definitions +
// access_definition_permissions) is authored in SQL migrations by the developer.
// This function handles the runtime side: assigning bundles to users, listing
// them, and the picker/list endpoints the admin UI needs.
//
// Actions (dispatched via body.action):
//   assign_access            — assign an access bundle to a user
//   unassign_access          — revoke a bundle from a user
//   list_user_assignments    — what bundles a user has
//   list_access_definitions  — the catalog + per-page permissions
//   list_users               — every user with their roles flattened (picker)
//   list_pages               — every page row (also via public.pages directly)
//
// Authorization: caller's JWT must belong to a user with the 'admin' role,
// checked via public.has_role(uid, 'admin').

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function corsResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return corsResp({ error: 'Missing token' }, 401);
    }
    const token = authHeader.slice('Bearer '.length);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SR_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const verifier = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await verifier.auth.getUser(token);
    if (userErr || !userData.user) return corsResp({ error: 'Invalid token' }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SR_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isAdminData, error: roleErr } = await admin.rpc('has_role', {
      uid: callerId,
      role_name: 'admin',
    });
    if (roleErr) return corsResp({ error: 'Role check failed: ' + roleErr.message }, 500);
    if (isAdminData !== true) return corsResp({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const action: string = body?.action;
    if (!action) return corsResp({ error: 'Missing action' }, 400);

    switch (action) {
      case 'assign_access': {
        const { user_id, access_id } = body;
        if (!user_id || !access_id) return corsResp({ error: 'user_id and access_id required' }, 400);

        const { data, error } = await admin
          .from('user_access')
          .upsert({
            user_id,
            access_id,
            assigned_by: callerId,
            assigned_at: new Date().toISOString(),
          }, { onConflict: 'user_id,access_id' })
          .select()
          .single();
        if (error) return corsResp({ error: error.message }, 400);
        return corsResp({ assignment: data });
      }

      case 'unassign_access': {
        const { user_id, access_id } = body;
        if (!user_id || !access_id) return corsResp({ error: 'user_id and access_id required' }, 400);

        const { error } = await admin
          .from('user_access')
          .delete()
          .eq('user_id', user_id)
          .eq('access_id', access_id);
        if (error) return corsResp({ error: error.message }, 400);
        return corsResp({ deleted: true });
      }

      case 'list_user_assignments': {
        const { user_id } = body;
        if (!user_id) return corsResp({ error: 'user_id required' }, 400);

        const { data, error } = await admin
          .from('user_access')
          .select('access_id, assigned_at, access_definitions(code, name, description)')
          .eq('user_id', user_id);
        if (error) return corsResp({ error: error.message }, 400);
        return corsResp({ assignments: data ?? [] });
      }

      case 'list_access_definitions': {
        // Returns the catalog + flat permissions matrix per page for each definition.
        const { data, error } = await admin
          .from('access_definitions')
          .select(`
            id, code, name, description, created_at,
            access_definition_permissions(
              page_id, can_view, can_create, can_edit, can_delete, can_approve,
              pages(code, label)
            )
          `)
          .order('id');
        if (error) return corsResp({ error: error.message }, 400);
        return corsResp({ definitions: data ?? [] });
      }

      case 'list_users': {
        const { data, error } = await admin
          .from('users')
          .select('id, email, full_name, is_admin, user_roles(roles(name))')
          .order('email');
        if (error) return corsResp({ error: error.message }, 400);
        const users = (data ?? []).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          is_admin: u.is_admin,
          roles: (u.user_roles ?? []).map((ur: any) => ur.roles?.name).filter(Boolean),
        }));
        return corsResp({ users });
      }

      case 'list_pages': {
        const { data, error } = await admin
          .from('pages')
          .select('id, code, label, description, requires_role')
          .order('id');
        if (error) return corsResp({ error: error.message }, 400);
        return corsResp({ pages: data ?? [] });
      }

      default:
        return corsResp({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return corsResp(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500,
    );
  }
});
