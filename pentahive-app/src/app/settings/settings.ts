import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';
import { supabase } from '../supabase.client';

type Section = 'profile' | 'security' | 'appearance' | 'notifications';

interface UserAssignment {
  access_id: number;
  name: string;
  description: string | null;
  assigned_at: string;
}

interface NotifPrefs {
  email_po_overdue: boolean;
  email_inventory_low: boolean;
  email_credit_hold: boolean;
  email_grn_dispute: boolean;
  email_weekly_digest: boolean;
  inapp_all: boolean;
}

const DEFAULT_NOTIFS: NotifPrefs = {
  email_po_overdue: true,
  email_inventory_low: true,
  email_credit_hold: true,
  email_grn_dispute: true,
  email_weekly_digest: false,
  inapp_all: true,
};

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="set-shell">
      <!-- Left vertical nav -->
      <aside class="set-nav">
        <button class="set-nav-item" [class.on]="section() === 'profile'"       (click)="section.set('profile')">
          <span class="ico">👤</span><span class="lbl">Profile</span>
        </button>
        <button class="set-nav-item" [class.on]="section() === 'security'"      (click)="section.set('security')">
          <span class="ico">🔒</span><span class="lbl">Security</span>
        </button>
        <button class="set-nav-item" [class.on]="section() === 'appearance'"    (click)="section.set('appearance')">
          <span class="ico">🎨</span><span class="lbl">Appearance</span>
        </button>
        <button class="set-nav-item" [class.on]="section() === 'notifications'" (click)="section.set('notifications')">
          <span class="ico">🔔</span><span class="lbl">Notifications</span>
        </button>
      </aside>

      <!-- Right content -->
      <section class="set-content">
        @if (section() === 'profile') {
          <div class="card">
            <div class="card-h"><div class="card-t">Profile</div></div>

            <div class="profile-grid">
              <div class="ph-field">
                <label class="ph-label">Email</label>
                <input class="ph-input" [value]="auth.user()?.email" readonly />
                <span class="help">Email is the login identifier — contact an admin to change it.</span>
              </div>

              <div class="ph-field">
                <label class="ph-label">Display Name</label>
                <input class="ph-input" [(ngModel)]="profile.full_name" name="full_name" placeholder="How should we show your name?" />
              </div>

              <div class="ph-field">
                <label class="ph-label">User ID</label>
                <input class="ph-input mono" [value]="(auth.user()?.id || '').slice(0, 18) + '…'" readonly />
                <span class="help dim">Internal Supabase auth UID.</span>
              </div>

              <div class="ph-field">
                <label class="ph-label">Roles</label>
                <div class="role-row">
                  @if (auth.roles().length === 0) {
                    <span class="role-pill role-none">No role</span>
                  } @else {
                    @for (r of auth.roles(); track r) {
                      <span [class]="rolePillClass(r)">{{ r }}</span>
                    }
                  }
                </div>
                <span class="help dim">Roles are managed by an administrator.</span>
              </div>
            </div>

            @if (profileMsg(); as m) {
              <div class="ph-alert" [class]="m.kind === 'err' ? 'ph-alert-error' : 'ph-alert-success'" style="margin-top:14px">
                {{ m.text }}
              </div>
            }

            <div class="form-actions">
              <button type="button" class="ph-btn ph-btn-primary" (click)="saveProfile()" [disabled]="savingProfile() || !profileDirty()">
                {{ savingProfile() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </div>

          <!-- Access bundles assigned to this user -->
          <div class="card" style="margin-top:18px">
            <div class="card-h"><div class="card-t">My Access</div></div>

            @if (auth.isAdmin()) {
              <p class="muted">You have the <strong class="ta">admin</strong> role — full access on every page regardless of bundle assignments.</p>
            } @else if (assignmentsLoading()) {
              <p class="muted">Loading assignments…</p>
            } @else if (assignments().length === 0) {
              <p class="muted warn-text">You have no access bundles assigned. Ask an administrator to assign one.</p>
            } @else {
              <ul class="bundle-list">
                @for (a of assignments(); track a.access_id) {
                  <li>
                    <div>
                      <div class="bundle-name">{{ a.name }}</div>
                      @if (a.description) { <div class="bundle-desc">{{ a.description }}</div> }
                    </div>
                    <div class="bundle-meta">Assigned {{ formatDate(a.assigned_at) }}</div>
                  </li>
                }
              </ul>
            }
          </div>
        }

        @if (section() === 'security') {
          <div class="card">
            <div class="card-h"><div class="card-t">Change Password</div></div>

            <form (ngSubmit)="changePassword()" class="security-form">
              <div class="ph-field">
                <label class="ph-label">New Password</label>
                <input class="ph-input" type="password" [(ngModel)]="security.password" name="password" autocomplete="new-password"
                       placeholder="At least 8 characters" minlength="8" required />
              </div>

              <div class="ph-field">
                <label class="ph-label">Confirm Password</label>
                <input class="ph-input" type="password" [(ngModel)]="security.confirm" name="confirm" autocomplete="new-password"
                       placeholder="Re-enter your new password" required />
              </div>

              <ul class="rules">
                <li [class.ok]="security.password.length >= 8">
                  <span class="check"></span> Minimum 8 characters
                </li>
                <li [class.ok]="security.confirm.length > 0 && security.password === security.confirm">
                  <span class="check"></span> Passwords match
                </li>
              </ul>

              @if (securityMsg(); as m) {
                <div class="ph-alert" [class]="m.kind === 'err' ? 'ph-alert-error' : 'ph-alert-success'">
                  {{ m.text }}
                </div>
              }

              <div class="form-actions">
                <button type="submit" class="ph-btn ph-btn-primary" [disabled]="savingSecurity() || !passwordValid()">
                  {{ savingSecurity() ? 'Updating…' : 'Update password' }}
                </button>
              </div>
            </form>
          </div>
        }

        @if (section() === 'appearance') {
          <div class="card">
            <div class="card-h"><div class="card-t">Appearance</div></div>

            <div class="appearance">
              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Theme</div>
                  <div class="setting-desc">Switch between light and dark color schemes.</div>
                </div>
                <div class="theme-picker">
                  <button class="theme-opt" [class.on]="theme.theme() === 'light'" (click)="theme.set('light')">
                    <span class="ico">🌙</span> Light
                  </button>
                  <button class="theme-opt" [class.on]="theme.theme() === 'dark'" (click)="theme.set('dark')">
                    <span class="ico">☀</span> Dark
                  </button>
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Table density</div>
                  <div class="setting-desc">How tightly rows are packed in tables. Affects all module pages.</div>
                </div>
                <div class="theme-picker">
                  <button class="theme-opt" [class.on]="density() === 'comfortable'" (click)="setDensity('comfortable')">
                    Comfortable
                  </button>
                  <button class="theme-opt" [class.on]="density() === 'compact'" (click)="setDensity('compact')">
                    Compact
                  </button>
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Currency display</div>
                  <div class="setting-desc">Symbol used in money columns. Defaults to PHP.</div>
                </div>
                <select class="ph-select" style="max-width:200px" [(ngModel)]="currencyPref" (change)="saveAppearance()" name="currency">
                  <option value="PHP">₱ Philippine Peso (PHP)</option>
                  <option value="USD">$ US Dollar (USD)</option>
                  <option value="THB">฿ Thai Baht (THB)</option>
                  <option value="VND">₫ Vietnamese Dong (VND)</option>
                </select>
              </div>
            </div>

            @if (appearanceMsg(); as m) {
              <div class="ph-alert ph-alert-success" style="margin-top:14px">{{ m }}</div>
            }
          </div>
        }

        @if (section() === 'notifications') {
          <div class="card">
            <div class="card-h"><div class="card-t">Notifications</div></div>

            <div class="ph-alert ph-alert-info" style="margin-bottom:14px">
              <strong>Heads up:</strong> notification producers (PO overdue / inventory low / etc.) aren't wired yet —
              the schema is ready, and your toggles are saved, but no emails or in-app alerts fire until those producer triggers ship.
            </div>

            <div class="notif-list">
              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Purchase Orders — Overdue</div>
                  <div class="setting-desc">Email me when a PO passes its expected delivery date without a GRN.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.email_po_overdue" name="po_over" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Inventory — Low Stock</div>
                  <div class="setting-desc">Email me when on-hand drops below the SKU's reorder point.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.email_inventory_low" name="inv_low" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Customer — Credit Hold</div>
                  <div class="setting-desc">Email me when a customer's AR balance pushes them onto credit hold.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.email_credit_hold" name="cred_hold" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Goods Receipts — QC Dispute</div>
                  <div class="setting-desc">Email me when a GRN posts with partial or full rejection.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.email_grn_dispute" name="grn_disp" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Weekly Digest</div>
                  <div class="setting-desc">A summary email every Monday covering the past week.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.email_weekly_digest" name="weekly" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">In-app notifications</div>
                  <div class="setting-desc">Show the red dot + notification panel in the topbar.</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="notifs.inapp_all" name="inapp" (change)="saveNotifs()" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            @if (notifsMsg(); as m) {
              <div class="ph-alert ph-alert-success" style="margin-top:14px">{{ m }}</div>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }

    .set-shell {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 880px) {
      .set-shell { grid-template-columns: 1fr; }
    }

    .set-nav {
      display: flex; flex-direction: column;
      gap: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 10px;
      position: sticky;
      top: 0;
    }
    .set-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px;
      border: none;
      background: transparent;
      color: var(--sub);
      font-size: 13px; font-weight: 500;
      border-radius: var(--r6);
      cursor: pointer;
      text-align: left;
    }
    .set-nav-item:hover { background: var(--row-hover); color: var(--text); }
    .set-nav-item.on {
      background: var(--gold-bg);
      color: var(--gold);
      font-weight: 600;
    }
    .set-nav-item .ico { font-size: 15px; width: 20px; text-align: center; }

    .set-content { min-width: 0; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 22px;
    }
    .card-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .card-t { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }

    .profile-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 720px) {
      .profile-grid { grid-template-columns: 1fr; }
    }

    .help { font-size: 10.5px; color: var(--sub); }
    .help.dim { color: var(--dim); }

    .role-row { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 4px; }
    .role-pill {
      display: inline-flex;
      font-size: 10px; font-weight: 700;
      padding: 4px 10px; border-radius: 12px;
      text-transform: uppercase; letter-spacing: 0.06em;
      border: 1px solid transparent;
    }
    .role-admin   { background: var(--gold-bg);  color: var(--gold);  border-color: var(--gold-rim); }
    .role-manager { background: var(--sky-bg);   color: var(--sky);   border-color: var(--sky-rim); }
    .role-user    { background: var(--jade-bg);  color: var(--jade);  border-color: var(--jade-rim); }
    .role-none    { background: var(--rose-bg);  color: var(--rose);  border-color: var(--rose-rim); }

    .muted { color: var(--sub); font-size: 0.9rem; }
    .warn-text { color: var(--gold); font-weight: 500; }
    .ta { color: var(--gold); }

    .bundle-list { list-style: none; padding: 0; margin: 0; }
    .bundle-list li {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 1rem;
      padding: 10px 0;
      border-bottom: 1px solid var(--sum-border);
    }
    .bundle-list li:last-child { border-bottom: none; }
    .bundle-name { font-size: 13px; font-weight: 600; color: var(--text); }
    .bundle-desc { font-size: 11.5px; color: var(--sub); margin-top: 2px; }
    .bundle-meta { font-size: 11px; color: var(--dim); white-space: nowrap; }

    /* Security */
    .security-form { display: flex; flex-direction: column; gap: 14px; max-width: 460px; }
    .rules {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: 6px;
      font-size: 0.82rem;
      color: var(--sub);
    }
    .rules li { display: flex; align-items: center; gap: 8px; }
    .rules .check {
      width: 14px; height: 14px; border-radius: 999px;
      background: var(--raised);
      border: 1px solid var(--rim);
      position: relative;
      flex: 0 0 auto;
    }
    .rules li.ok { color: var(--jade); }
    .rules li.ok .check { background: var(--jade); border-color: var(--jade); }
    .rules li.ok .check::after {
      content: '';
      position: absolute; inset: 2px;
      background: #fff;
      clip-path: polygon(14% 50%, 0 64%, 38% 100%, 100% 22%, 86% 8%, 38% 70%);
    }

    /* Appearance */
    .appearance { display: flex; flex-direction: column; gap: 0; }
    .setting-row {
      display: flex; align-items: center; gap: 16px;
      padding: 14px 0;
      border-bottom: 1px solid var(--sum-border);
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-info { flex: 1; min-width: 0; }
    .setting-label { font-size: 13px; font-weight: 600; color: var(--text); }
    .setting-desc { font-size: 11.5px; color: var(--sub); margin-top: 2px; }

    .theme-picker {
      display: inline-flex; background: var(--raised);
      border: 1px solid var(--rim); border-radius: var(--r8);
      padding: 3px; gap: 2px;
    }
    .theme-opt {
      padding: 6px 14px; border-radius: var(--r6);
      cursor: pointer; font-size: 12px; color: var(--sub);
      font-weight: 500; background: transparent; border: none;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .theme-opt.on {
      background: var(--gold); color: var(--gold-text);
      font-weight: 700; box-shadow: 0 2px 8px rgba(242,168,65,.25);
    }

    /* Notifications toggle switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 42px; height: 24px;
      flex-shrink: 0;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--rim);
      transition: .25s;
      border-radius: 24px;
    }
    .slider::before {
      content: '';
      position: absolute;
      height: 18px; width: 18px;
      left: 3px; top: 3px;
      background: white;
      transition: .25s;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,.15);
    }
    .switch input:checked + .slider { background: var(--gold); }
    .switch input:checked + .slider::before { transform: translateX(18px); }

    .form-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 18px; padding-top: 16px;
      border-top: 1px solid var(--border);
    }
  `,
})
export class Settings {
  auth = inject(AuthService);
  theme = inject(ThemeService);

  section = signal<Section>('profile');

  // Profile
  profile = { full_name: '' };
  initialFullName = '';
  savingProfile = signal(false);
  profileMsg = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Access
  assignments = signal<UserAssignment[]>([]);
  assignmentsLoading = signal(true);

  // Security
  security = { password: '', confirm: '' };
  savingSecurity = signal(false);
  securityMsg = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Appearance
  density = signal<'comfortable' | 'compact'>(
    (localStorage.getItem('pentahive-density') as any) || 'comfortable'
  );
  currencyPref = localStorage.getItem('pentahive-currency') || 'PHP';
  appearanceMsg = signal<string | null>(null);

  // Notifications
  notifs: NotifPrefs = { ...DEFAULT_NOTIFS };
  notifsMsg = signal<string | null>(null);

  profileDirty = computed(() => this.profile.full_name !== this.initialFullName);
  passwordValid = computed(() =>
    this.security.password.length >= 8 && this.security.password === this.security.confirm
  );

  constructor() {
    // Load profile + assignments + notification prefs once we know who the user is.
    effect(() => {
      const u = this.auth.user();
      if (!u) return;
      this.loadProfile();
      this.loadAssignments();
      this.loadNotifsFromMetadata();
    });
  }

  // ---------------- Profile ----------------
  async loadProfile() {
    const uid = this.auth.user()?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', uid)
      .single();
    this.profile.full_name = data?.full_name ?? '';
    this.initialFullName = this.profile.full_name;
  }

  async saveProfile() {
    this.savingProfile.set(true);
    this.profileMsg.set(null);
    const uid = this.auth.user()?.id;
    if (!uid) { this.profileMsg.set({ kind: 'err', text: 'Not signed in.' }); this.savingProfile.set(false); return; }

    const { error } = await supabase
      .from('users')
      .update({ full_name: this.profile.full_name.trim() || null })
      .eq('id', uid);

    this.savingProfile.set(false);
    if (error) { this.profileMsg.set({ kind: 'err', text: error.message }); return; }
    this.initialFullName = this.profile.full_name;
    this.profileMsg.set({ kind: 'ok', text: 'Profile updated.' });
    setTimeout(() => this.profileMsg.set(null), 2500);
  }

  // ---------------- Assignments ----------------
  async loadAssignments() {
    const uid = this.auth.user()?.id;
    if (!uid) return;
    this.assignmentsLoading.set(true);
    const { data } = await supabase
      .from('user_access')
      .select('access_id, assigned_at, access_definitions(name, description)')
      .eq('user_id', uid);
    this.assignments.set((data ?? []).map((r: any) => ({
      access_id: r.access_id,
      name: r.access_definitions?.name ?? '—',
      description: r.access_definitions?.description ?? null,
      assigned_at: r.assigned_at,
    })));
    this.assignmentsLoading.set(false);
  }

  // ---------------- Security ----------------
  async changePassword() {
    if (!this.passwordValid()) return;
    this.savingSecurity.set(true);
    this.securityMsg.set(null);

    const { error } = await supabase.auth.updateUser({ password: this.security.password });

    this.savingSecurity.set(false);
    if (error) { this.securityMsg.set({ kind: 'err', text: error.message }); return; }
    this.security = { password: '', confirm: '' };
    this.securityMsg.set({ kind: 'ok', text: 'Password updated. Next sign-in will use the new password.' });
    setTimeout(() => this.securityMsg.set(null), 3500);
  }

  // ---------------- Appearance ----------------
  setDensity(d: 'comfortable' | 'compact') {
    this.density.set(d);
    localStorage.setItem('pentahive-density', d);
    document.documentElement.setAttribute('data-density', d);
    this.saveAppearance();
  }
  saveAppearance() {
    localStorage.setItem('pentahive-currency', this.currencyPref);
    this.appearanceMsg.set('Preferences saved.');
    setTimeout(() => this.appearanceMsg.set(null), 2000);
  }

  // ---------------- Notifications ----------------
  loadNotifsFromMetadata() {
    const meta: any = this.auth.user()?.user_metadata ?? {};
    const saved = meta.notification_prefs as Partial<NotifPrefs> | undefined;
    this.notifs = { ...DEFAULT_NOTIFS, ...(saved || {}) };
  }
  async saveNotifs() {
    this.notifsMsg.set(null);
    const { error } = await supabase.auth.updateUser({
      data: { notification_prefs: this.notifs },
    });
    if (error) {
      this.notifsMsg.set('Failed to save: ' + error.message);
      return;
    }
    this.notifsMsg.set('Notification preferences saved.');
    setTimeout(() => this.notifsMsg.set(null), 2000);
  }

  // ---------------- Helpers ----------------
  rolePillClass(r: string) {
    return 'role-pill ' +
      (r === 'admin'   ? 'role-admin'   :
       r === 'manager' ? 'role-manager' :
       r === 'user'    ? 'role-user'    : 'role-none');
  }
  formatDate(s: string) {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
