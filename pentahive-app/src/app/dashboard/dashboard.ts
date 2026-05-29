import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <!-- KPI row — placeholder values until module tables are built -->
    <div class="krow k4">
      <div class="kcard kc-g">
        <span class="kcard-ico">💹</span>
        <div class="kcard-lbl">Revenue MTD</div>
        <div class="kcard-val">—</div>
        <div class="kcard-sub">No data yet</div>
      </div>
      <div class="kcard kc-r">
        <span class="kcard-ico">📤</span>
        <div class="kcard-lbl">AP Outstanding</div>
        <div class="kcard-val">—</div>
        <div class="kcard-sub">No data yet</div>
      </div>
      <div class="kcard kc-b">
        <span class="kcard-ico">🏪</span>
        <div class="kcard-lbl">Inventory Value</div>
        <div class="kcard-val">—</div>
        <div class="kcard-sub">No data yet</div>
      </div>
      <div class="kcard kc-a">
        <span class="kcard-ico">📋</span>
        <div class="kcard-lbl">Active POs</div>
        <div class="kcard-val">—</div>
        <div class="kcard-sub">No data yet</div>
      </div>
    </div>

    <!-- Access summary -->
    <div class="g2">
      <div class="card">
        <div class="card-h">
          <div class="card-t">Your Profile</div>
          @if (auth.isAdmin()) {
            <span class="role-pill role-admin">Admin</span>
          } @else if (auth.isManager()) {
            <span class="role-pill role-manager">Manager</span>
          } @else if (auth.roles().length) {
            <span class="role-pill role-user">{{ roleLabel() }}</span>
          } @else {
            <span class="role-pill role-none">No role</span>
          }
        </div>

        @if (auth.user(); as user) {
          <div class="profile">
            <div class="profile-row"><span class="lbl">Email</span><span class="val mono">{{ user.email }}</span></div>
            <div class="profile-row"><span class="lbl">User ID</span><span class="val mono dim">{{ user.id.slice(0, 8) }}…</span></div>
            <div class="profile-row"><span class="lbl">Roles</span><span class="val">{{ roleLabel() || '—' }}</span></div>
          </div>
        }
      </div>

      <div class="card">
        <div class="card-h">
          <div class="card-t">Page Access</div>
          @if (auth.isAdmin()) {
            <a class="manage-link" routerLink="/admin/access">Manage →</a>
          }
        </div>

        @if (!auth.accessLoaded()) {
          <p class="muted">Loading access…</p>
        } @else if (auth.isAdmin()) {
          <p class="success">Full access to every module.</p>
          <p class="muted small">Role bypass — no per-page assignments required.</p>
        } @else if (auth.grants().length === 0) {
          <p class="warn-text">No access bundles assigned yet. Ask an administrator to assign one.</p>
        } @else {
          <ul class="grants">
            @for (g of auth.grants(); track g.page_code) {
              <li>
                <strong>{{ g.page_label }}</strong>
                <span class="perms">
                  @if (g.can_view)    { <span class="perm">view</span> }
                  @if (g.can_create)  { <span class="perm">create</span> }
                  @if (g.can_edit)    { <span class="perm">edit</span> }
                  @if (g.can_delete)  { <span class="perm">delete</span> }
                  @if (g.can_approve) { <span class="perm approve">approve</span> }
                </span>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }

    /* KPI cards — port of mockup .kcard pattern */
    .kcard {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 20px;
      position: relative; overflow: hidden;
      transition: all .2s;
      animation: fadeUp .4s ease both;
    }
    .kcard:hover { border-color: var(--rim); transform: translateY(-2px); box-shadow: var(--shadow); }
    .kcard::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0;
      height: 2px; border-radius: 2px 2px 0 0;
    }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kcard-ico { font-size: 22px; margin-bottom: 10px; display: block; }
    .kcard-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kcard-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kcard-sub { font-size: 11px; color: var(--sub); }

    .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    @media (max-width: 880px) { .g2 { grid-template-columns: 1fr; } }

    .role-pill {
      font-size: 10px; font-weight: 700;
      padding: 3px 9px; border-radius: 12px;
      text-transform: uppercase; letter-spacing: 0.06em;
      border: 1px solid transparent;
    }
    .role-admin   { background: var(--gold-bg);  color: var(--gold);  border-color: var(--gold-rim); }
    .role-manager { background: var(--sky-bg);   color: var(--sky);   border-color: var(--sky-rim); }
    .role-user    { background: var(--jade-bg);  color: var(--jade);  border-color: var(--jade-rim); }
    .role-none    { background: var(--rose-bg);  color: var(--rose);  border-color: var(--rose-rim); }

    .profile {
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .profile-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--sum-border);
    }
    .profile-row:last-child { border-bottom: none; }
    .lbl { color: var(--sub); font-size: 0.85rem; }
    .val { color: var(--text); font-size: 0.9rem; font-weight: 500; }
    .val.mono { font-family: var(--mono); }
    .val.dim  { color: var(--dim); }

    .muted { color: var(--sub); font-size: 0.9rem; }
    .muted.small { font-size: 0.78rem; color: var(--dim); }
    .success { color: var(--jade); font-weight: 600; }
    .warn-text { color: var(--gold); font-weight: 500; }

    .manage-link {
      font-size: 11px; font-weight: 600;
      color: var(--gold);
      padding: 4px 10px;
      border-radius: var(--r6);
      border: 1px solid var(--gold-rim);
      background: var(--gold-bg);
    }
    .manage-link:hover { text-decoration: none; opacity: 0.9; }

    .grants { list-style: none; padding: 0; margin: 0; }
    .grants li {
      padding: 8px 0;
      border-bottom: 1px solid var(--sum-border);
      display: flex; justify-content: space-between; align-items: center;
      gap: 1rem;
      color: var(--text);
      font-size: 0.85rem;
    }
    .grants li:last-child { border-bottom: none; }
    .perms { display: inline-flex; gap: 0.3rem; flex-wrap: wrap; }
    .perm {
      background: var(--raised);
      color: var(--sub);
      padding: 2px 7px;
      border-radius: var(--r4);
      font-size: 0.7rem;
      font-family: var(--mono);
    }
    .perm.approve {
      background: var(--gold-bg);
      color: var(--gold);
      border: 1px solid var(--gold-rim);
    }
  `,
})
export class Dashboard {
  auth = inject(AuthService);

  roleLabel = computed(() =>
    this.auth.roles().map(r => r[0].toUpperCase() + r.slice(1)).join(' · ')
  );
}
