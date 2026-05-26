import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';

interface NavItem {
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

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: '📊', pageCode: 'dashboard' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/weighbridge',        label: 'Weighbridge',        icon: '⚖️', pageCode: 'weighbridge', badge: { text: 'LIVE', kind: 'green' } },
      { path: '/milling',            label: 'Milling',            icon: '⚙️', pageCode: 'milling' },
      { path: '/inventory',          label: 'Inventory',          icon: '🏪', pageCode: 'inventory' },
      { path: '/quality-inspection', label: 'Quality Inspection', icon: '🔬', pageCode: 'quality-inspection' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { path: '/customers',           label: 'Customers',          icon: '👥', pageCode: 'customers' },
      { path: '/sales-orders',        label: 'Sales Orders',       icon: '🧾', pageCode: 'sales-orders' },
      { path: '/deliveries',          label: 'Delivery',           icon: '🚛', pageCode: 'deliveries' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { path: '/suppliers',         label: 'Suppliers',         icon: '🏭', pageCode: 'suppliers' },
      { path: '/purchase-requests', label: 'Purchase Requests', icon: '📝', pageCode: 'purchase-requests' },
      { path: '/canvasses',         label: 'Canvasses',         icon: '📋', pageCode: 'canvasses' },
      { path: '/purchase-orders',   label: 'Purchase Orders',   icon: '📦', pageCode: 'purchase-orders' },
      { path: '/goods-receipts',    label: 'Goods Receipt',     icon: '📥', pageCode: 'goods-receipts' },
      { path: '/items',             label: 'Items',             icon: '🪙', pageCode: 'items' },
      { path: '/warehouses',        label: 'Warehouses',        icon: '🏚️', pageCode: 'warehouses' },
    ],
  },
  {
    label: 'Importation',
    items: [
      { path: '/importation', label: 'Shipments', icon: '🚢', pageCode: 'importation' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { path: '/general-ledger',      label: 'General Ledger',     icon: '📊', pageCode: 'general-ledger' },
      { path: '/accounts-payable',    label: 'Accounts Payable',   icon: '💳', pageCode: 'accounts-payable' },
      { path: '/accounts-receivable', label: 'Accounts Receivable',icon: '💰', pageCode: 'accounts-receivable' },
      { path: '/dcpr',                label: 'DCPR',               icon: '📒', pageCode: 'dcpr', badge: { text: 'DAILY', kind: 'green' } },
      { path: '/bir-compliance',      label: 'BIR Compliance',     icon: '🏛️', pageCode: 'bir-compliance' },
    ],
  },
  {
    label: 'Treasury',
    items: [
      { path: '/treasury', label: 'Cash Position', icon: '🏦', pageCode: 'treasury' },
    ],
  },
  {
    label: 'HR & Reports',
    items: [
      { path: '/hr',      label: 'Employees', icon: '👤', pageCode: 'hr' },
      { path: '/payroll', label: 'Payroll',   icon: '💼', pageCode: 'payroll' },
      { path: '/reports', label: 'Reports',   icon: '📈', pageCode: 'reports' },
      { path: '/vendos',  label: 'Vendos',    icon: '🥤', pageCode: 'vendos' },
    ],
  },
];

const ADMIN_NAV: NavGroup = {
  label: 'Admin',
  items: [
    { path: '/admin/users',  label: 'Users',  icon: '🛡️', pageCode: 'admin-users' },
    { path: '/admin/access', label: 'Access', icon: '🔑', pageCode: 'admin-access' },
  ],
};

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <aside id="sb">
      <div class="sb-logo">
        <div class="sb-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#0B1118">
            <polygon points="12 2 22 8 22 16 12 22 2 16 2 8"></polygon>
            <path d="M12 12 L22 8"></path>
            <path d="M12 12 L2 8"></path>
            <path d="M12 12 L12 22"></path>
          </svg>
        </div>
        <div>
          <div class="sb-name">PentaHive</div>
          <div class="sb-ver">ERP v1.0</div>
        </div>
      </div>

      <nav>
        @for (group of visibleNav(); track group.label) {
          <div class="ns">{{ group.label }}</div>
          @for (item of group.items; track item.path) {
            <a class="ni" [routerLink]="item.path" routerLinkActive="on">
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
        <div class="av">{{ initials() }}</div>
        <div class="sb-who">
          <div class="av-name">{{ displayName() }}</div>
          <div class="av-role">{{ roleLabel() }}</div>
        </div>
      </div>
    </aside>

    <div id="main">
      <div id="topbar">
        <div>
          <div class="tb-title">{{ pageTitle() }}</div>
          <div class="tb-crumb">PentaHive · {{ activeGroup() }}</div>
        </div>
        <div class="tb-acts">
          <button class="notif-btn" (click)="theme.toggle()" [title]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'">
            {{ theme.theme() === 'dark' ? '☀' : '🌙' }}
          </button>
          <button class="notif-btn" (click)="signOut()" title="Sign out">⎋</button>
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
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 2;
    }
    .sb-logo {
      padding: 20px 18px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sb-mark {
      width: 40px; height: 40px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(242,168,65,.3);
      flex-shrink: 0;
      background: linear-gradient(135deg, var(--gold), var(--gold-d));
      color: var(--gold-text);
    }
    .sb-name {
      font-size: 15px; font-weight: 800;
      color: var(--text); letter-spacing: -.4px;
    }
    .sb-ver {
      font-size: 10px; color: var(--dim);
      letter-spacing: .8px; text-transform: uppercase; margin-top: 1px;
    }
    nav {
      flex: 1; overflow-y: auto;
      padding: 10px 0;
      scrollbar-width: none;
    }
    nav::-webkit-scrollbar { display: none; }
    .ns {
      padding: 14px 18px 6px;
      font-size: 9.5px; font-weight: 700;
      color: var(--dim);
      letter-spacing: 1.2px; text-transform: uppercase;
    }
    .ni {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 18px;
      color: var(--sub);
      font-size: 12.5px; font-weight: 500;
      border-left: 2px solid transparent;
      transition: all .18s ease;
      user-select: none;
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
    .ni .nb {
      background: var(--rose); color: #fff;
      font-size: 9.5px; font-weight: 700;
      padding: 1.5px 6px; border-radius: 10px;
      font-family: var(--mono);
    }
    .ni .ng {
      background: var(--jade-bg); color: var(--jade);
      font-size: 9.5px; font-weight: 700;
      padding: 1.5px 6px; border-radius: 10px;
      font-family: var(--mono);
      border: 1px solid var(--jade-rim);
    }
    .sb-foot {
      padding: 14px 18px;
      border-top: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .av {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--sky), var(--violet));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800; color: #fff;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(59,130,246,.3);
    }
    .sb-who { min-width: 0; }
    .av-name {
      font-size: 12.5px; font-weight: 600; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 140px;
    }
    .av-role { font-size: 10.5px; color: var(--dim); }

    /* ── Topbar ── */
    #topbar {
      background: var(--base);
      border-bottom: 1px solid var(--border);
      padding: 0 28px;
      height: var(--ph-topbar-h);
      display: flex; align-items: center; gap: 16px;
      flex-shrink: 0;
      position: relative; z-index: 1;
    }
    .tb-title {
      font-size: 16px; font-weight: 700;
      color: var(--text); letter-spacing: -.3px;
    }
    .tb-crumb {
      font-size: 11px; color: var(--dim);
      font-weight: 400; display: block; margin-top: 1px;
    }
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

  private currentUrl = signal(this.router.url);

  constructor() {
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) this.currentUrl.set(e.urlAfterRedirects);
    });
  }

  visibleNav = computed<NavGroup[]>(() => {
    const groups = [...NAV];
    if (this.auth.isAdmin()) groups.push(ADMIN_NAV);
    return groups;
  });

  activeNavItem = computed<NavItem | null>(() => {
    const url = this.currentUrl();
    for (const g of this.visibleNav()) {
      for (const it of g.items) {
        if (url === it.path || url.startsWith(it.path + '/')) return it;
      }
    }
    return null;
  });

  pageTitle = computed(() => this.activeNavItem()?.label ?? 'PentaHive');
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

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
