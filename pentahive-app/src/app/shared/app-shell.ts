import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth.service';

interface NavItem {
  label: string;
  route: string;
  icon: string; // single-character glyph
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="shell" [class.collapsed]="collapsed()">
      <aside class="side">
        <div class="side-brand">
          <span class="hex">⬣</span>
          <span class="name">WVW ERP</span>
        </div>

        <nav class="side-nav">
          <div class="nav-section">Workspace</div>
          @for (item of visibleNav(); track item.route) {
            <a class="nav-link" [routerLink]="item.route" routerLinkActive="active">
              <span class="ico">{{ item.icon }}</span>
              <span class="lbl">{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="side-foot">
          <button class="collapse-btn" (click)="toggle()" [title]="collapsed() ? 'Expand' : 'Collapse'">
            <span>{{ collapsed() ? '›' : '‹' }}</span>
          </button>
          <span class="ver">v1.0</span>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="crumbs">
            <span class="crumb-root">Workspace</span>
            <span class="crumb-sep">/</span>
            <span class="crumb-cur">{{ title() }}</span>
          </div>

          <div class="top-actions">
            <div class="search">
              <span class="s-ico">⌕</span>
              <input class="s-input" type="text" placeholder="Search…" />
            </div>

            @if (auth.user(); as user) {
              <div class="user-chip">
                <div class="avatar">{{ initial(user.email) }}</div>
                <div class="ident">
                  <span class="who">{{ user.email }}</span>
                  @if (auth.roles().length) {
                    <span class="role">{{ auth.roles().join(' · ') }}</span>
                  } @else if (auth.accessLoaded()) {
                    <span class="role warn">no role</span>
                  }
                </div>
              </div>
              <button class="ph-btn ph-btn-secondary" (click)="signOut()">Sign out</button>
            }
          </div>
        </header>

        <main class="content">
          <div class="page-head">
            <div>
              <h1>{{ title() }}</h1>
              @if (subtitle()) { <p class="sub">{{ subtitle() }}</p> }
            </div>
            <div class="page-actions">
              <ng-content select="[shellActions]"></ng-content>
            </div>
          </div>

          <div class="page-body">
            <ng-content></ng-content>
          </div>
        </main>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--ph-bg); }

    .shell {
      display: grid;
      grid-template-columns: var(--ph-side-w) 1fr;
      min-height: 100vh;
      transition: grid-template-columns 0.18s ease;
    }
    .shell.collapsed { grid-template-columns: 72px 1fr; }

    /* ---------- Sidebar ---------- */
    .side {
      background: linear-gradient(180deg, var(--ph-side-bg) 0%, var(--ph-side-bg-2) 100%);
      color: var(--ph-side-text);
      border-right: 1px solid var(--ph-side-border);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: hidden;
    }
    .side-brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 1.05rem 1.25rem;
      border-bottom: 1px solid var(--ph-side-border);
      color: #fff;
      font-weight: 700;
      letter-spacing: -0.01em;
      font-size: 1rem;
    }
    .hex {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--ph-brand-600), var(--ph-accent-600));
      box-shadow: 0 6px 14px rgba(37, 99, 235, 0.4);
      font-size: 0.95rem;
      flex: 0 0 auto;
    }
    .shell.collapsed .side-brand .name { display: none; }

    .side-nav {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .nav-section {
      padding: 0.65rem 0.85rem 0.4rem;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #64748b;
    }
    .shell.collapsed .nav-section { display: none; }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.55rem 0.85rem;
      border-radius: 8px;
      color: var(--ph-side-text);
      font-size: 0.9rem;
      font-weight: 500;
      text-decoration: none;
      transition: background 0.12s, color 0.12s;
      border-left: 3px solid transparent;
    }
    .nav-link:hover { background: rgba(255,255,255,0.04); color: #fff; }
    .nav-link.active {
      background: var(--ph-side-active-bg);
      color: #fff;
      border-left-color: var(--ph-side-active-bd);
    }
    .nav-link .ico {
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      color: #93c5fd;
      flex: 0 0 auto;
    }
    .nav-link.active .ico { color: #fff; }
    .shell.collapsed .nav-link { justify-content: center; padding: 0.55rem; }
    .shell.collapsed .nav-link .lbl { display: none; }

    .side-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.7rem 1rem;
      border-top: 1px solid var(--ph-side-border);
      color: var(--ph-side-text-dim);
      font-size: 0.78rem;
    }
    .shell.collapsed .side-foot .ver { display: none; }
    .collapse-btn {
      background: transparent;
      color: var(--ph-side-text-dim);
      border: 1px solid var(--ph-side-border);
      border-radius: 6px;
      width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.12s, color 0.12s;
    }
    .collapse-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }

    /* ---------- Main column ---------- */
    .main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      height: var(--ph-topbar-h);
      background: var(--ph-surface);
      border-bottom: 1px solid var(--ph-border);
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0 1.5rem;
    }
    .crumbs {
      font-size: 0.85rem;
      color: var(--ph-muted);
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .crumb-cur { color: var(--ph-text); font-weight: 600; }
    .crumb-sep { color: var(--ph-faint); }

    .top-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .search {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: var(--ph-surface-2);
      border: 1px solid var(--ph-border);
      border-radius: 8px;
      padding: 0.4rem 0.7rem;
      min-width: 260px;
    }
    .search:focus-within {
      border-color: var(--ph-accent-500);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      background: var(--ph-surface);
    }
    .s-ico { color: var(--ph-faint); font-size: 0.95rem; }
    .s-input {
      border: 0;
      background: transparent;
      outline: none;
      font: 400 0.88rem var(--ph-font);
      color: var(--ph-text);
      width: 100%;
    }
    .s-input::placeholder { color: var(--ph-faint); }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.25rem 0.6rem 0.25rem 0.3rem;
      border-radius: 999px;
      background: var(--ph-surface-2);
      border: 1px solid var(--ph-border);
    }
    .avatar {
      width: 30px; height: 30px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--ph-brand-600), var(--ph-accent-600));
      color: #fff;
      font-weight: 600;
      font-size: 0.85rem;
      display: inline-flex; align-items: center; justify-content: center;
      flex: 0 0 auto;
    }
    .ident { display: flex; flex-direction: column; line-height: 1.1; }
    .ident .who { font-size: 0.82rem; color: var(--ph-text); font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ident .role {
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ph-accent-700);
      font-weight: 600;
    }
    .ident .role.warn { color: var(--ph-warn-700); }

    /* ---------- Content ---------- */
    .content {
      padding: 1.5rem 1.75rem 2.5rem;
      max-width: 1400px;
      width: 100%;
    }
    .page-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .page-head h1 {
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.015em;
    }
    .page-head .sub {
      color: var(--ph-muted);
      margin: 0.25rem 0 0;
      font-size: 0.9rem;
    }
    .page-actions {
      display: flex; align-items: center; gap: 0.5rem;
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 860px) {
      .shell, .shell.collapsed { grid-template-columns: 72px 1fr; }
      .side-brand .name, .nav-section, .nav-link .lbl, .side-foot .ver { display: none; }
      .nav-link { justify-content: center; padding: 0.55rem; }
      .search { display: none; }
      .ident .who { max-width: 120px; }
      .content { padding: 1.25rem; }
    }
    @media (max-width: 520px) {
      .ident { display: none; }
      .user-chip { padding: 0.25rem; }
    }
  `,
})
export class AppShell {
  auth = inject(AuthService);
  private router = inject(Router);

  title = input<string>('');
  subtitle = input<string>('');

  collapsed = signal(false);

  private allNav: NavItem[] = [
    { label: 'Dashboard',    route: '/dashboard',   icon: '◫' },
    { label: 'Home',         route: '/home',        icon: '⌂' },
    { label: 'Manage Users', route: '/admin/users', icon: '◷', adminOnly: true },
  ];

  visibleNav = computed<NavItem[]>(() => {
    const isAdmin = this.auth.isAdmin();
    return this.allNav.filter(item => !item.adminOnly || isAdmin);
  });

  toggle() { this.collapsed.update(v => !v); }

  initial(email: string | undefined): string {
    return (email?.[0] ?? '?').toUpperCase();
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
