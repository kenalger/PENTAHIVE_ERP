import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../supabase.client';
import { AuthService } from '../auth.service';
import { Modal } from '../ui/modal';

type Tab = 'users' | 'roles' | 'access';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  roles: string[];
  bundles: { access_id: number; name: string }[];
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

interface AccessDef {
  id: number;
  code: string;
  name: string;
  description: string | null;
  permissions: { page_code: string; page_label: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_approve: boolean }[];
}

@Component({
  selector: 'app-admin',
  imports: [FormsModule, Modal],
  template: `
    @if (!auth.isAdmin()) {
      <div class="ph-alert ph-alert-error">
        <strong>Admin access required.</strong> You don't have the <code>admin</code> role.
      </div>
    } @else {

    <!-- ─────── Header + stat strip ─────── -->
    <header class="hdr">
      <div>
        <h1 class="hdr-t">Admin Console</h1>
        <p class="hdr-sub">Users, roles, and access bundle management.</p>
      </div>
      <div class="stat-strip">
        <div class="stat">
          <div class="stat-v">{{ users().length }}</div>
          <div class="stat-l">Users</div>
        </div>
        <div class="stat">
          <div class="stat-v">{{ adminCount() }}</div>
          <div class="stat-l">Admins</div>
        </div>
        <div class="stat">
          <div class="stat-v">{{ accessDefs().length }}</div>
          <div class="stat-l">Bundles</div>
        </div>
        <div class="stat">
          <div class="stat-v">{{ withBundleCount() }}</div>
          <div class="stat-l">Assigned</div>
        </div>
      </div>
    </header>

    @if (adminWarning()) {
      <div class="ph-alert ph-alert-warn" style="margin-bottom:16px">
        ⚠️ Removing your own <strong>admin</strong> role is blocked — you're the only admin.
      </div>
    }

    @if (loadError()) {
      <div class="ph-alert ph-alert-error" style="margin-bottom:16px">
        <strong>Failed to load admin data:</strong> {{ loadError() }}
      </div>
    }

    <!-- ─────── Tabs ─────── -->
    <nav class="tabs" role="tablist">
      <button class="tab" [class.on]="tab() === 'users'" (click)="tab.set('users')" role="tab" [attr.aria-selected]="tab() === 'users'">
        Users
        <span class="tab-c">{{ users().length }}</span>
      </button>
      <button class="tab" [class.on]="tab() === 'roles'" (click)="tab.set('roles')" role="tab" [attr.aria-selected]="tab() === 'roles'">
        Roles
        <span class="tab-c">{{ allRoles().length }}</span>
      </button>
      <button class="tab" [class.on]="tab() === 'access'" (click)="tab.set('access')" role="tab" [attr.aria-selected]="tab() === 'access'">
        Access
        <span class="tab-c">{{ accessDefs().length }}</span>
      </button>
    </nav>

    <!-- ─────── USERS TAB ─────── -->
    @if (tab() === 'users') {
      <div class="panel">
        <!-- User list -->
        <section class="card">
          <header class="card-h">
            <div>
              <div class="card-t">User list</div>
              <div class="card-sub">Manage roles inline. Bundle assignments live in the Access tab.</div>
            </div>
            <button type="button" class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreateUser()">
              ＋ Create User
            </button>
          </header>

          @if (loading()) { <p class="empty">Loading…</p> }
          @else if (users().length === 0) { <p class="empty">No users found.</p> }
          @else {
            <div class="tw">
              <table class="ph-table clean">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Roles</th>
                    <th style="width:220px">Add role</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr>
                      <td>
                        <div class="u-cell">
                          <div class="u-avatar">{{ initials(u) }}</div>
                          <div>
                            <div class="u-email">{{ u.email }}</div>
                            <div class="u-name">{{ u.full_name || '—' }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="chip-row">
                          @if (u.roles.length === 0) {
                            <span class="role-pill role-none">no role</span>
                          } @else {
                            @for (r of u.roles; track r) {
                              <span class="role-chip" [class]="rolePillClass(r)">
                                {{ r }}
                                @if (u.id !== auth.user()?.id || r !== 'admin') {
                                  <button type="button" class="x-btn" (click)="removeRole(u, r)" [disabled]="busy()" title="Remove role">×</button>
                                }
                              </span>
                            }
                          }
                        </div>
                      </td>
                      <td>
                        <div class="assign-row">
                          <select class="ph-select" [ngModel]="pickedRole[u.id] || ''" (ngModelChange)="pickedRole[u.id] = $event" [name]="'rolepick-' + u.id">
                            <option value="">— Select role —</option>
                            @for (r of availableRolesFor(u); track r.id) {
                              <option [value]="r.name">{{ r.name }}</option>
                            }
                          </select>
                          <button class="ph-btn ph-btn-primary ph-btn-sm"
                                  [disabled]="busy() || !pickedRole[u.id]"
                                  (click)="assignRole(u, pickedRole[u.id])">Assign</button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <!-- Create user modal -->
        <app-modal [open]="showCreate()" [title]="'Create User'" (closed)="closeCreateUser()">
          <form (ngSubmit)="createUser()">
            <p class="modal-lede">
              A new account is created with a temporary password. The new user will be forced to change it on first login.
            </p>
            <div class="ph-field">
              <label class="ph-label" for="new-user-email">Email *</label>
              <input
                id="new-user-email"
                class="ph-input"
                type="email"
                [(ngModel)]="newUserEmail"
                name="email"
                placeholder="employee@company.com"
                autocomplete="off"
                required
                [disabled]="creating()"
              />
            </div>

            @if (createError()) {
              <div class="ph-alert ph-alert-error" style="margin-top:14px">{{ createError() }}</div>
            }

            @if (createdUser(); as u) {
              <div class="ph-alert ph-alert-success" style="margin-top:14px">
                <div><strong>Account created — share these credentials securely:</strong></div>
                <div style="margin-top:6px"><strong>Email:</strong> {{ u.email }}</div>
                <div><strong>Temp password:</strong> <code class="temp-code">{{ u.tempPassword }}</code></div>
                <div class="dim" style="margin-top:6px">
                  Forced password change on first login. This won't be shown again.
                </div>
              </div>
            }

            <div class="form-actions">
              <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreateUser()">
                {{ createdUser() ? 'Done' : 'Cancel' }}
              </button>
              @if (!createdUser()) {
                <button type="submit" class="ph-btn ph-btn-primary" [disabled]="creating() || !newUserEmail.trim()">
                  {{ creating() ? 'Creating…' : 'Create user' }}
                </button>
              }
            </div>
          </form>
        </app-modal>
      </div>
    }

    <!-- ─────── ROLES TAB ─────── -->
    @if (tab() === 'roles') {
      <div class="panel">
        <section class="card">
          <header class="card-h">
            <div>
              <div class="card-t">Roles list</div>
              <div class="card-sub">Built-in roles. Assignments are managed from the Users tab.</div>
            </div>
          </header>

          <div class="role-grid">
            @for (r of allRoles(); track r.id) {
              <article class="role-tile" [class]="'rt-' + r.name">
                <div class="rt-head">
                  <span [class]="rolePillClass(r.name)">{{ r.name }}</span>
                  <span class="rt-count">{{ userCountByRole(r.name) }} user(s)</span>
                </div>
                <div class="rt-desc">{{ r.description || '—' }}</div>
              </article>
            }
          </div>
        </section>
      </div>
    }

    <!-- ─────── ACCESS TAB ─────── -->
    @if (tab() === 'access') {
      <div class="panel">
        <!-- Access bundles catalog -->
        <section class="card">
          <header class="card-h">
            <div>
              <div class="card-t">Access bundles</div>
              <div class="card-sub">Developer-authored bundles. New ones are added via SQL migrations.</div>
            </div>
          </header>

          @if (defsLoading()) { <p class="empty">Loading bundles…</p> }
          @else if (accessDefs().length === 0) { <p class="empty">No bundles defined yet.</p> }
          @else {
            <ul class="bundle-list">
              @for (d of accessDefs(); track d.id) {
                <li class="bundle">
                  <div class="b-head">
                    <div class="b-info">
                      <div class="b-name">{{ d.name }}</div>
                      <div class="b-desc">{{ d.description || '—' }}</div>
                    </div>
                    <div class="b-meta">
                      <span class="chip">{{ d.permissions.length }} pages</span>
                      <span class="chip mono ta">{{ d.code }}</span>
                      <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="toggleBundle(d.id)">
                        {{ expanded[d.id] ? 'Hide' : 'View' }}
                      </button>
                    </div>
                  </div>

                  @if (expanded[d.id]) {
                    <table class="ph-table mini">
                      <thead><tr><th>Page</th><th>View</th><th>Create</th><th>Edit</th><th>Delete</th><th>Approve</th></tr></thead>
                      <tbody>
                        @for (p of d.permissions; track p.page_code) {
                          <tr>
                            <td>{{ p.page_label }}</td>
                            <td>{{ p.can_view    ? '✓' : '—' }}</td>
                            <td>{{ p.can_create  ? '✓' : '—' }}</td>
                            <td>{{ p.can_edit    ? '✓' : '—' }}</td>
                            <td>{{ p.can_delete  ? '✓' : '—' }}</td>
                            <td>{{ p.can_approve ? '✓' : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <!-- Bundle assignments -->
        <section class="card">
          <header class="card-h">
            <div>
              <div class="card-t">User assignments</div>
              <div class="card-sub">Grant or revoke bundles per user. Admins bypass via role.</div>
            </div>
          </header>

          @if (loading()) { <p class="empty">Loading…</p> }
          @else if (users().length === 0) { <p class="empty">No users yet.</p> }
          @else {
            <div class="tw">
              <table class="ph-table clean">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Assigned bundles</th>
                    <th style="width:260px">Add bundle</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr>
                      <td>
                        <div class="u-cell">
                          <div class="u-avatar">{{ initials(u) }}</div>
                          <div>
                            <div class="u-email">{{ u.email }}</div>
                            <div class="u-name">{{ u.full_name || '—' }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="chip-row">
                          @if (u.roles.includes('admin')) {
                            <span class="bypass">Admin · full access</span>
                          } @else if (u.bundles.length === 0) {
                            <span class="empty-inline">No bundles</span>
                          } @else {
                            @for (b of u.bundles; track b.access_id) {
                              <span class="role-chip bundle-chip">
                                {{ b.name }}
                                <button type="button" class="x-btn" (click)="removeBundle(u, b)" [disabled]="busy()" title="Revoke">×</button>
                              </span>
                            }
                          }
                        </div>
                      </td>
                      <td>
                        <div class="assign-row">
                          <select class="ph-select" [ngModel]="pickedBundle[u.id] || ''" (ngModelChange)="pickedBundle[u.id] = $event" [name]="'bpick-' + u.id" [disabled]="u.roles.includes('admin')">
                            <option value="">— Select bundle —</option>
                            @for (d of availableBundlesFor(u); track d.id) {
                              <option [value]="d.id">{{ d.name }}</option>
                            }
                          </select>
                          <button class="ph-btn ph-btn-primary ph-btn-sm"
                                  [disabled]="busy() || !pickedBundle[u.id] || u.roles.includes('admin')"
                                  (click)="assignBundle(u, +pickedBundle[u.id])">Assign</button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    }

    }
  `,
  styles: `
    :host { display: block; animation: fadeUp .35s ease both; }

    /* ── Header ── */
    .hdr {
      display: flex; justify-content: space-between; align-items: flex-end;
      gap: 24px; margin-bottom: 24px; flex-wrap: wrap;
    }
    .hdr-t {
      font-size: 22px; font-weight: 700;
      color: var(--text); letter-spacing: -.02em;
      margin: 0 0 4px 0;
    }
    .hdr-sub { font-size: 13px; color: var(--sub); margin: 0; }

    .stat-strip {
      display: flex; gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
      border-radius: var(--r8);
      overflow: hidden;
    }
    .stat {
      background: var(--surface);
      padding: 10px 18px;
      min-width: 80px;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .stat-v {
      font-family: var(--mono);
      font-size: 18px; font-weight: 700;
      color: var(--text); letter-spacing: -.02em;
      line-height: 1;
    }
    .stat-l {
      font-size: 9.5px; font-weight: 600;
      color: var(--dim);
      text-transform: uppercase; letter-spacing: .1em;
    }

    /* ── Tabs ── */
    .tabs {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r8);
      margin-bottom: 22px;
    }
    .tab {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 16px;
      background: transparent;
      border: none;
      border-radius: var(--r6);
      color: var(--sub);
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: all .15s ease;
    }
    .tab:hover { color: var(--text); background: var(--row-hover); }
    .tab.on {
      background: var(--raised);
      color: var(--text);
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    .tab-c {
      font-family: var(--mono);
      font-size: 10.5px; font-weight: 700;
      padding: 1px 7px;
      background: var(--row-hover);
      color: var(--dim);
      border-radius: 999px;
      min-width: 18px; text-align: center;
    }
    .tab.on .tab-c { background: var(--gold-bg); color: var(--gold); }

    /* ── Panels ── */
    .panel { display: flex; flex-direction: column; gap: 16px; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 22px;
    }
    .card-h {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; margin-bottom: 18px;
    }
    .card-t {
      font-size: 14px; font-weight: 700;
      color: var(--text); letter-spacing: -.01em;
    }
    .card-sub {
      font-size: 12px; color: var(--sub);
      margin-top: 3px;
    }

    .modal-lede {
      font-size: 12.5px; color: var(--sub);
      margin: 0 0 14px 0; line-height: 1.5;
    }
    .form-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 18px; padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .temp-code {
      font-family: var(--mono);
      background: var(--raised);
      padding: 4px 10px;
      border-radius: var(--r4);
      font-size: 1em;
    }
    .dim { color: var(--dim); font-size: 11.5px; }
    .empty {
      padding: 24px 0;
      text-align: center;
      color: var(--sub);
      font-size: 13px;
    }
    .empty-inline { color: var(--dim); font-size: 11.5px; }
    .bypass {
      font-size: 11px; font-style: italic;
      color: var(--gold);
    }

    /* ── User cell ── */
    .u-cell { display: flex; align-items: center; gap: 10px; }
    .u-avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--sky), var(--violet));
      color: #fff;
      font-size: 10.5px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      letter-spacing: .02em;
    }
    .u-email { font-weight: 600; color: var(--text); font-size: 13px; }
    .u-name { font-size: 11.5px; color: var(--dim); margin-top: 1px; }

    /* ── Table tweaks ── */
    .ph-table.clean th {
      font-size: 10.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      color: var(--dim);
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    .ph-table.clean td {
      padding: 14px;
      border-bottom: 1px solid var(--border);
    }
    .ph-table.clean tbody tr:last-child td { border-bottom: none; }
    .ph-table.clean tbody tr:hover { background: var(--row-hover); }

    .ph-table.mini { font-size: 12px; margin-top: 12px; }
    .ph-table.mini th { padding: 6px 10px; }
    .ph-table.mini td { padding: 6px 10px; }

    /* ── Role tiles ── */
    .role-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .role-tile {
      background: var(--raised);
      border: 1px solid var(--border);
      border-radius: var(--r8);
      padding: 16px;
      transition: border-color .15s;
    }
    .role-tile:hover { border-color: var(--mist); }
    .rt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .rt-count {
      font-family: var(--mono); font-size: 10.5px;
      color: var(--dim);
    }
    .rt-desc { font-size: 12px; color: var(--sub); line-height: 1.5; }

    /* ── Bundle list ── */
    .bundle-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .bundle {
      background: var(--raised);
      border: 1px solid var(--border);
      border-radius: var(--r8);
      padding: 14px 16px;
      transition: border-color .15s;
    }
    .bundle:hover { border-color: var(--mist); }
    .b-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .b-info { flex: 1; min-width: 0; }
    .b-name { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .b-desc { font-size: 11.5px; color: var(--sub); margin-top: 2px; }
    .b-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

    /* ── Chips & pills ── */
    .chip {
      display: inline-flex;
      padding: 3px 9px;
      border-radius: var(--r4);
      font-size: 10.5px; font-weight: 600;
      background: var(--surface);
      color: var(--sub);
      border: 1px solid var(--border);
    }
    .chip.mono { font-family: var(--mono); }
    .chip.ta { color: var(--gold); border-color: var(--gold-rim); background: var(--gold-bg); }

    .role-pill, .role-chip {
      display: inline-flex; align-items: center;
      font-size: 10px; font-weight: 700;
      border-radius: 12px;
      text-transform: uppercase; letter-spacing: .06em;
      border: 1px solid transparent;
    }
    .role-pill { padding: 3px 9px; margin-right: 4px; }
    .role-chip { padding: 3px 4px 3px 10px; gap: 4px; }

    .role-admin   { background: var(--gold-bg);  color: var(--gold);  border-color: var(--gold-rim); }
    .role-manager { background: var(--sky-bg);   color: var(--sky);   border-color: var(--sky-rim); }
    .role-user    { background: var(--jade-bg);  color: var(--jade);  border-color: var(--jade-rim); }
    .role-none    { background: var(--rose-bg);  color: var(--rose);  border-color: var(--rose-rim); }
    .role-chip.bundle-chip {
      background: var(--violet-bg); color: var(--violet);
      border: 1px solid var(--violet-rim);
      text-transform: none; letter-spacing: 0;
      font-weight: 600;
    }

    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

    .x-btn {
      background: none; border: none; padding: 0;
      width: 18px; height: 18px; line-height: 1;
      color: inherit; opacity: .55;
      cursor: pointer; font-size: 14px;
      border-radius: 999px;
    }
    .x-btn:hover { opacity: 1; background: rgba(0,0,0,.08); }
    .x-btn:disabled { opacity: .3; cursor: not-allowed; }

    .assign-row { display: flex; gap: 6px; align-items: center; }
    .assign-row .ph-select { flex: 1; padding: 6px 10px; font-size: 12px; }

    @media (max-width: 720px) {
      .hdr { flex-direction: column; align-items: stretch; gap: 16px; }
      .stat-strip { overflow-x: auto; }
    }
  `,
})
export class Admin {
  auth = inject(AuthService);

  tab = signal<Tab>('users');

  users = signal<UserRow[]>([]);
  allRoles = signal<Role[]>([]);
  accessDefs = signal<AccessDef[]>([]);

  loading = signal(true);
  defsLoading = signal(true);
  busy = signal(false);
  loadError = signal<string | null>(null);

  newUserEmail = '';
  creating = signal(false);
  createError = signal<string | null>(null);
  createdUser = signal<{ email: string; tempPassword: string } | null>(null);
  showCreate = signal(false);

  pickedRole: Record<string, string> = {};
  pickedBundle: Record<string, string> = {};

  expanded: Record<number, boolean> = {};

  adminCount = computed(() => this.users().filter(u => u.roles.includes('admin')).length);
  withBundleCount = computed(() => this.users().filter(u => u.bundles.length > 0).length);
  adminWarning = signal(false);

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.defsLoading.set(true);
    this.loadError.set(null);

    // NOTE: `user_access` has two FKs back to `users` (user_id + assigned_by),
    // so PostgREST embeds must disambiguate with the column hint `!user_id`
    // — otherwise it returns PGRST201 (ambiguous relationship) and supabase-js
    // surfaces null data with an error. Same hint on user_roles is harmless.
    const [u, r, defs] = await Promise.all([
      supabase.from('users')
        .select('id, email, full_name, is_admin, user_roles!user_id(roles(id, name)), user_access!user_id(access_id, access_definitions(name))')
        .order('email'),
      supabase.from('roles').select('id, name, description').eq('app', 'wvw').order('id'),
      supabase.from('access_definitions')
        .select('id, code, name, description, access_definition_permissions(can_view, can_create, can_edit, can_delete, can_approve, pages(code, label))')
        .order('id'),
    ]);

    this.loading.set(false);
    this.defsLoading.set(false);

    const firstErr = u.error ?? r.error ?? defs.error;
    if (firstErr) {
      this.loadError.set(firstErr.message);
      console.error('[Admin.load] supabase error:', firstErr);
    }

    this.users.set(((u.data ?? []) as any[]).map(row => ({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      is_admin: row.is_admin,
      roles: (row.user_roles ?? []).map((ur: any) => ur.roles?.name).filter(Boolean),
      bundles: (row.user_access ?? []).map((ua: any) => ({
        access_id: ua.access_id,
        name: ua.access_definitions?.name ?? '—',
      })),
    })));
    this.allRoles.set((r.data ?? []) as Role[]);
    this.accessDefs.set(((defs.data ?? []) as any[]).map(d => ({
      id: d.id, code: d.code, name: d.name, description: d.description,
      permissions: (d.access_definition_permissions ?? []).map((p: any) => ({
        page_code: p.pages?.code ?? '—',
        page_label: p.pages?.label ?? '—',
        can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit,
        can_delete: p.can_delete, can_approve: p.can_approve,
      })),
    })));
  }

  openCreateUser() {
    this.newUserEmail = '';
    this.createError.set(null);
    this.createdUser.set(null);
    this.showCreate.set(true);
  }
  closeCreateUser() { this.showCreate.set(false); }

  // ─── Create user ─────────────────────────────────
  // Calls the admin_create_user(p_email) Postgres function, which:
  //  - verifies caller is admin (via has_role)
  //  - creates an auth.users row + matching identity
  //  - returns the generated temp password (shown to admin ONCE)
  //  - sets must_change_password = true so the new user is forced through
  //    /change-password on first login
  async createUser() {
    const email = this.newUserEmail.trim();
    if (!email) return;
    this.creating.set(true);
    this.createError.set(null);
    this.createdUser.set(null);

    const { data, error } = await supabase.rpc('admin_create_user', { p_email: email });
    this.creating.set(false);

    if (error) {
      // Postgres exceptions surface as error.message; strip the "forbidden: " etc. prefix for cleanliness.
      const msg = error.message?.replace(/^.*?:\s*/, '') ?? 'Failed to create user';
      this.createError.set(msg);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.temp_password) {
      this.createError.set('Unexpected RPC response — no temp password returned.');
      return;
    }

    this.createdUser.set({ email: row.email, tempPassword: row.temp_password });
    this.newUserEmail = '';
    await this.load();
  }

  // ─── Role assignments ────────────────────────────
  userCountByRole(name: string): number {
    return this.users().filter(u => u.roles.includes(name)).length;
  }
  availableRolesFor(u: UserRow): Role[] {
    return this.allRoles().filter(r => !u.roles.includes(r.name));
  }
  async assignRole(u: UserRow, roleName: string) {
    if (!roleName) return;
    const role = this.allRoles().find(r => r.name === roleName);
    if (!role) return;
    this.busy.set(true);
    const { error } = await supabase.from('user_roles').insert({ user_id: u.id, role_id: role.id });
    this.busy.set(false);
    if (error) { alert(error.message); return; }
    this.pickedRole[u.id] = '';
    await this.load();
    if (u.id === this.auth.user()?.id) await this.auth.loadAccess();
  }
  async removeRole(u: UserRow, roleName: string) {
    if (roleName === 'admin' && u.id === this.auth.user()?.id && this.adminCount() <= 1) {
      this.adminWarning.set(true);
      setTimeout(() => this.adminWarning.set(false), 4000);
      return;
    }
    const role = this.allRoles().find(r => r.name === roleName);
    if (!role) return;
    this.busy.set(true);
    const { error } = await supabase.from('user_roles').delete()
      .eq('user_id', u.id).eq('role_id', role.id);
    this.busy.set(false);
    if (error) { alert(error.message); return; }
    await this.load();
    if (u.id === this.auth.user()?.id) await this.auth.loadAccess();
  }

  // ─── Bundle assignments ──────────────────────────
  availableBundlesFor(u: UserRow): AccessDef[] {
    const assignedIds = new Set(u.bundles.map(b => b.access_id));
    return this.accessDefs().filter(d => !assignedIds.has(d.id));
  }
  toggleBundle(id: number) { this.expanded[id] = !this.expanded[id]; }
  async assignBundle(u: UserRow, accessId: number) {
    if (!accessId) return;
    this.busy.set(true);
    const { error } = await supabase.from('user_access').insert({
      user_id: u.id,
      access_id: accessId,
      assigned_by: this.auth.user()?.id ?? null,
    });
    this.busy.set(false);
    if (error) { alert(error.message); return; }
    this.pickedBundle[u.id] = '';
    await this.load();
    if (u.id === this.auth.user()?.id) await this.auth.loadAccess();
  }
  async removeBundle(u: UserRow, b: { access_id: number; name: string }) {
    this.busy.set(true);
    const { error } = await supabase.from('user_access').delete()
      .eq('user_id', u.id).eq('access_id', b.access_id);
    this.busy.set(false);
    if (error) { alert(error.message); return; }
    await this.load();
    if (u.id === this.auth.user()?.id) await this.auth.loadAccess();
  }

  // ─── Helpers ─────────────────────────────────────
  rolePillClass(r: string) {
    return 'role-pill ' +
      (r === 'admin'   ? 'role-admin'   :
       r === 'manager' ? 'role-manager' :
       r === 'user'    ? 'role-user'    : 'role-none');
  }

  initials(u: UserRow): string {
    const src = u.full_name || u.email;
    return src.split(/[\s@.]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  }
}
