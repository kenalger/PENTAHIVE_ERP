import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';
import { supabase } from '../supabase.client';

interface NavItem {
  /** path *segment* relative to the workspace, e.g. 'dashboard' or 'sales-orders' */
  path: string;
  label: string;
  icon: string;
  pageCode: string;
  badge?: { text: string; kind: 'red' | 'green' };
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface WorkspaceMeta {
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
}

/**
 * Workspace-scoped sidebar nav. Paths are RELATIVE — the shell prepends
 * `/<workspace>/` at render time so the same NAV can be reused for future
 * workspaces with matching module sets.
 *
 * Right now this nav is the Milling workspace's. When Hardware ships with its
 * own module set we'll either branch on workspace() or load nav from the DB.
 */
const MILLING_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: '📊', pageCode: 'dashboard' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: 'weighbridge',        label: 'Weighbridge',        icon: '⚖️', pageCode: 'weighbridge', badge: { text: 'LIVE', kind: 'green' } },
      { path: 'milling',            label: 'Milling',            icon: '⚙️', pageCode: 'milling' },
      { path: 'inventory',          label: 'Inventory',          icon: '🏪', pageCode: 'inventory' },
      { path: 'quality-inspection', label: 'Quality Inspection', icon: '🔬', pageCode: 'quality-inspection' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { path: 'customers',           label: 'Customers',          icon: '👥', pageCode: 'customers' },
      { path: 'sales-orders',        label: 'Sales Orders',       icon: '🧾', pageCode: 'sales-orders' },
      { path: 'deliveries',          label: 'Delivery',           icon: '🚛', pageCode: 'deliveries' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { path: 'suppliers',         label: 'Suppliers',         icon: '🏭', pageCode: 'suppliers' },
      { path: 'purchase-requests', label: 'Purchase Requests', icon: '📝', pageCode: 'purchase-requests' },
      { path: 'canvasses',         label: 'Canvasses',         icon: '📋', pageCode: 'canvasses' },
      { path: 'purchase-orders',   label: 'Purchase Orders',   icon: '📦', pageCode: 'purchase-orders' },
      { path: 'goods-receipts',    label: 'Goods Receipt',     icon: '📥', pageCode: 'goods-receipts' },
      { path: 'items',             label: 'Items',             icon: '🪙', pageCode: 'items' },
      { path: 'warehouses',        label: 'Warehouses',        icon: '🏚️', pageCode: 'warehouses' },
    ],
  },
  {
    label: 'Importation',
    items: [
      { path: 'importation', label: 'Shipments', icon: '🚢', pageCode: 'importation' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { path: 'general-ledger',      label: 'General Ledger',     icon: '📊', pageCode: 'general-ledger' },
      { path: 'accounts-payable',    label: 'Accounts Payable',   icon: '💳', pageCode: 'accounts-payable' },
      { path: 'accounts-receivable', label: 'Accounts Receivable',icon: '💰', pageCode: 'accounts-receivable' },
      { path: 'dcpr',                label: 'DCPR',               icon: '📒', pageCode: 'dcpr', badge: { text: 'DAILY', kind: 'green' } },
      { path: 'bir-compliance',      label: 'BIR Compliance',     icon: '🏛️', pageCode: 'bir-compliance' },
    ],
  },
  {
    label: 'Treasury',
    items: [
      { path: 'treasury', label: 'Cash Position', icon: '🏦', pageCode: 'treasury' },
    ],
  },
  {
    label: 'HR & Reports',
    items: [
      { path: 'hr',      label: 'Employees', icon: '👤', pageCode: 'hr' },
      { path: 'payroll', label: 'Payroll',   icon: '💼', pageCode: 'payroll' },
      { path: 'reports', label: 'Reports',   icon: '📈', pageCode: 'reports' },
      { path: 'vendos',  label: 'Vendos',    icon: '🥤', pageCode: 'vendos' },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <aside id="sb">
      <div class="sb-logo">
        <div class="sb-mark">
          <span class="ws-glyph">{{ workspaceMeta()?.icon || '⬣' }}</span>
        </div>
        <div>
          <div class="sb-name">{{ workspaceMeta()?.name || 'PentaHive' }}</div>
          <div class="sb-ver">{{ workspace() }} workspace</div>
        </div>
      </div>

      <nav>
        @for (group of visibleNav(); track group.label) {
          <div class="ns">{{ group.label }}</div>
          @for (item of group.items; track item.path) {
            <a class="ni" [routerLink]="['/', workspace(), item.path]" routerLinkActive="on">
              <span class="ico">{{ item.icon }}</span>
              <span class="nlbl">{{ item.label }}</span>
              @if (item.badge) {
                <span [class]="item.badge.kind === 'red' ? 'nb' : 'ng'">{{ item.badge.text }}</span>
              }
            </a>
          }
        }
      </nav>

      <div class="sb-foot">
        <a class="switch-link" routerLink="/" title="Switch workspace">
          <span class="ico">⇆</span> Switch workspace
        </a>
      </div>
    </aside>

    <div id="main">
      <div id="topbar">
        <div>
          <div class="tb-title">{{ pageTitle() }}</div>
          <div class="tb-crumb">{{ workspaceMeta()?.name || workspace() }} · {{ activeGroup() }}</div>
        </div>
        <div class="tb-acts">
          <button class="notif-btn" (click)="theme.toggle()" [title]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'">
            {{ theme.theme() === 'dark' ? '☀' : '🌙' }}
          </button>
          <div class="user-menu">
            <button class="notif-btn user-btn" (click)="toggleUserMenu($event)" [class.open]="userMenuOpen()" title="Account">
              <span class="initials">{{ initials() }}</span>
            </button>
            @if (userMenuOpen()) {
              <div class="user-dd" role="menu">
                <div class="dd-head">
                  <div class="dd-name">{{ displayName() }}</div>
                  <div class="dd-role">{{ roleLabel() }}</div>
                </div>
                <button class="dd-item" (click)="go('/settings')" role="menuitem">
                  <span class="dd-ico">⚙️</span><span>Settings</span>
                </button>
                @if (auth.isAdmin()) {
                  <button class="dd-item" (click)="goAdmin()" role="menuitem">
                    <span class="dd-ico">🛡️</span><span>Admin Console</span>
                  </button>
                }
                <button class="dd-item" (click)="go('/')" role="menuitem">
                  <span class="dd-ico">⇆</span><span>Switch workspace</span>
                </button>
                <div class="dd-sep"></div>
                <button class="dd-item danger" (click)="signOut()" role="menuitem">
                  <span class="dd-ico">⎋</span><span>Logout</span>
                </button>
              </div>
            }
          </div>
        </div>
      </div>
      <div id="content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      background: var(--void);
    }

    /* ── Sidebar ── */
    #sb {
      width: var(--ph-side-w);
      min-width: var(--ph-side-w);
      background: var(--base);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      position: relative; z-index: 2;
    }
    .sb-logo {
      height: var(--ph-topbar-h);
      padding: 0 18px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0; box-sizing: border-box;
    }
    .sb-mark {
      width: 36px; height: 36px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(242,168,65,.3);
      flex-shrink: 0;
      background: linear-gradient(135deg, var(--gold), var(--gold-d));
      color: var(--gold-text);
      font-size: 18px;
    }
    .sb-name { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -.4px; }
    .sb-ver { font-size: 10px; color: var(--dim); letter-spacing: .8px; text-transform: uppercase; margin-top: 1px; }

    nav { flex: 1; overflow-y: auto; padding: 10px 0; scrollbar-width: none; }
    nav::-webkit-scrollbar { display: none; }
    .ns { padding: 14px 18px 6px; font-size: 9.5px; font-weight: 700; color: var(--dim); letter-spacing: 1.2px; text-transform: uppercase; }
    .ni {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 18px; color: var(--sub);
      font-size: 12.5px; font-weight: 500;
      border-left: 2px solid transparent;
      transition: all .18s ease; user-select: none;
      text-decoration: none;
    }
    .ni:hover { color: var(--text); background: var(--row-hover); text-decoration: none; }
    .ni.on {
      color: var(--text);
      background: linear-gradient(90deg, var(--gold-bg), transparent);
      border-left-color: var(--gold);
      font-weight: 600;
    }
    .ni .ico { font-size: 15px; width: 20px; text-align: center; opacity: .8; }
    .ni.on .ico { opacity: 1; }
    .ni .nlbl { flex: 1; }
    .ni .nb { background: var(--rose); color: #fff; font-size: 9.5px; font-weight: 700; padding: 1.5px 6px; border-radius: 10px; font-family: var(--mono); }
    .ni .ng { background: var(--jade-bg); color: var(--jade); font-size: 9.5px; font-weight: 700; padding: 1.5px 6px; border-radius: 10px; font-family: var(--mono); border: 1px solid var(--jade-rim); }

    .sb-foot {
      padding: 12px 12px;
      border-top: 1px solid var(--border);
    }
    .switch-link {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px;
      border-radius: var(--r6);
      color: var(--sub); font-size: 12px; font-weight: 600;
      text-decoration: none;
      transition: background .15s, color .15s;
    }
    .switch-link:hover { background: var(--row-hover); color: var(--text); text-decoration: none; }
    .switch-link .ico { font-size: 14px; }

    /* ── Topbar ── */
    #topbar {
      background: var(--base);
      border-bottom: 1px solid var(--border);
      padding: 0 28px;
      height: var(--ph-topbar-h);
      display: flex; align-items: center; gap: 16px;
      flex-shrink: 0; position: relative; z-index: 1;
    }
    .tb-title { font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -.3px; }
    .tb-crumb { font-size: 11px; color: var(--dim); font-weight: 400; display: block; margin-top: 1px; }
    #topbar > :first-child { flex: 1; }
    .tb-acts { display: flex; align-items: center; gap: 10px; }
    .notif-btn {
      width: 34px; height: 34px;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r8);
      cursor: pointer;
      font-size: 15px;
      color: var(--text);
      transition: all .15s;
    }
    .notif-btn:hover { border-color: var(--mist); }

    .user-menu { position: relative; }
    .user-btn .initials {
      font-size: 11px; font-weight: 800;
      font-family: var(--mono);
      color: var(--gold-text);
      background: linear-gradient(135deg, var(--gold), var(--gold-d));
      width: 26px; height: 26px;
      border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .user-dd {
      position: absolute; top: calc(100% + 6px); right: 0;
      min-width: 220px;
      background: var(--surface);
      border: 1px solid var(--rim);
      border-radius: var(--r8);
      box-shadow: var(--shadow-lg);
      padding: 6px;
      z-index: 50;
    }
    .dd-head { padding: 10px 12px 8px; }
    .dd-name { font-size: 12.5px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
    .dd-role { font-size: 10.5px; color: var(--dim); margin-top: 1px; }
    .dd-sep { border-top: 1px solid var(--border); margin: 6px 0; }
    .dd-item {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 12px;
      background: transparent; border: none;
      cursor: pointer;
      color: var(--sub); font-size: 12.5px; font-weight: 500;
      border-radius: var(--r6);
      text-align: left;
    }
    .dd-item:hover { background: var(--row-hover); color: var(--text); }
    .dd-item.danger { color: var(--rose); }
    .dd-item.danger:hover { background: var(--rose-bg); }
    .dd-ico { font-size: 14px; width: 18px; text-align: center; }

    /* ── Content ── */
    #main {
      flex: 1;
      display: flex; flex-direction: column;
      overflow: hidden;
      position: relative; z-index: 1;
    }
    #content {
      flex: 1; overflow-y: auto;
      padding: 28px;
      background: var(--void);
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
  `,
})
export class Shell {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);

  private currentUrl = signal(this.router.url);
  userMenuOpen = signal(false);
  workspaceMeta = signal<WorkspaceMeta | null>(null);

  /** Extract the workspace code from the URL: '/milling/...' → 'milling'. */
  workspace = computed(() => {
    const segs = this.currentUrl().split('?')[0].split('/').filter(Boolean);
    return segs[0] || 'milling';
  });

  visibleNav = computed<NavGroup[]>(() => {
    // Right now only milling has a nav. Future workspaces can swap on workspace().
    return MILLING_NAV;
  });

  activeNavItem = computed<NavItem | null>(() => {
    const url = this.currentUrl();
    const ws = '/' + this.workspace() + '/';
    for (const g of this.visibleNav()) {
      for (const it of g.items) {
        const full = ws + it.path;
        if (url === full || url.startsWith(full + '/')) return it;
      }
    }
    return null;
  });

  pageTitle = computed(() => this.activeNavItem()?.label ?? this.workspaceMeta()?.name ?? 'PentaHive');
  activeGroup = computed(() => {
    const item = this.activeNavItem();
    if (!item) return 'Overview';
    for (const g of this.visibleNav()) if (g.items.includes(item)) return g.label;
    return 'Overview';
  });

  displayName = computed(() => {
    const u = this.auth.user();
    return u?.user_metadata?.['full_name'] || u?.email || 'Guest';
  });

  initials = computed(() => {
    const name = this.displayName();
    return name.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p: string) => p[0].toUpperCase()).join('');
  });

  roleLabel = computed(() => {
    const roles = this.auth.roles();
    if (roles.length === 0) return 'No role';
    return roles.map(r => r[0].toUpperCase() + r.slice(1)).join(' · ');
  });

  constructor() {
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.currentUrl.set(e.urlAfterRedirects);
        this.userMenuOpen.set(false);
        this.loadWorkspaceMeta();
      }
    });
    this.loadWorkspaceMeta();
  }

  private async loadWorkspaceMeta() {
    const code = this.workspace();
    if (this.workspaceMeta()?.code === code) return;
    const { data } = await supabase
      .from('workspaces')
      .select('code, name, icon, description')
      .eq('code', code)
      .single();
    if (data) this.workspaceMeta.set(data as WorkspaceMeta);
  }

  toggleUserMenu(ev: Event) {
    ev.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  go(path: string) {
    this.userMenuOpen.set(false);
    this.router.navigate([path]);
  }

  goAdmin() {
    this.userMenuOpen.set(false);
    this.router.navigate(['/', this.workspace(), 'admin']);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.userMenuOpen()) return;
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (menu && !menu.contains(ev.target as Node)) this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.userMenuOpen.set(false); }

  async signOut() {
    this.userMenuOpen.set(false);
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
