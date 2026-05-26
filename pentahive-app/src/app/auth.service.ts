import { Injectable, signal, computed } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase.client';
import { environment } from '../environments/environment';

export interface AccessGrant {
  page_id: number;
  page_code: string;
  page_label: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.user() !== null);

  // Role-based access (populated by loadAccess()).
  readonly roles = signal<string[]>([]);
  readonly grants = signal<AccessGrant[]>([]);
  readonly accessLoaded = signal(false);

  // Admin status: real source is roles signal. Falls back to env allowlist
  // so the system keeps working before access is loaded (first paint, hard reload).
  readonly isAdmin = computed(() => {
    if (this.roles().includes('admin')) return true;
    const email = this.user()?.email?.toLowerCase();
    return !!email && environment.adminEmails
      .map(e => e.toLowerCase())
      .includes(email);
  });

  readonly isManager = computed(() => this.roles().includes('manager'));

  readonly mustChangePassword = computed(() =>
    this.user()?.user_metadata?.['must_change_password'] === true
  );

  constructor() {
    supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      if (data.session) this.loadAccess();
    });
    supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        this.loadAccess();
      } else if (event === 'SIGNED_OUT') {
        this.clearAccess();
      }
    });
  }

  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    const r = await supabase.auth.signOut();
    this.clearAccess();
    return r;
  }

  async changePassword(newPassword: string) {
    return supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
  }

  // Fetches the current user's roles and the OR-union of effective permissions
  // from all access definitions assigned to them (via v_user_effective_access).
  // Idempotent — safe to call multiple times.
  async loadAccess(): Promise<void> {
    const uid = this.user()?.id;
    if (!uid) { this.clearAccess(); return; }

    const [{ data: roleRows }, { data: effectiveRows }] = await Promise.all([
      supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', uid),
      supabase
        .from('v_user_effective_access')
        .select('page_id, page_code, page_label, can_view, can_create, can_edit, can_delete, can_approve')
        .eq('user_id', uid),
    ]);

    const roles = (roleRows ?? [])
      .map((r: any) => r.roles?.name)
      .filter((n: string | undefined): n is string => !!n);
    this.roles.set(roles);

    const grants: AccessGrant[] = (effectiveRows ?? []).map((g: any) => ({
      page_id: g.page_id,
      page_code: g.page_code,
      page_label: g.page_label,
      can_view: g.can_view,
      can_create: g.can_create,
      can_edit: g.can_edit,
      can_delete: g.can_delete,
      can_approve: g.can_approve,
    }));
    this.grants.set(grants);
    this.accessLoaded.set(true);
  }

  clearAccess(): void {
    this.roles.set([]);
    this.grants.set([]);
    this.accessLoaded.set(false);
  }

  // Convenience helpers for UI gating. Mirror the DB's can_access() semantics:
  // admin → everything; manager → approve on everything; otherwise check the grant.
  canDo(pageCode: string, action: 'view' | 'create' | 'edit' | 'delete' | 'approve'): boolean {
    if (this.roles().includes('admin')) return true;
    if (this.roles().includes('manager') && action === 'approve') return true;
    const g = this.grants().find(x => x.page_code === pageCode);
    if (!g) return false;
    switch (action) {
      case 'view':    return g.can_view;
      case 'create':  return g.can_create;
      case 'edit':    return g.can_edit;
      case 'delete':  return g.can_delete;
      case 'approve': return g.can_approve;
    }
  }
}
