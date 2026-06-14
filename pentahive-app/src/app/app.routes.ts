import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { changePasswordGuard } from './change-password.guard';
import { pageAccessGuard } from './page-access.guard';
import { workspaceGuard } from './workspace.guard';

const loadPlaceholder = () => import('./placeholder/placeholder').then(m => m.Placeholder);

const ph = (pageCode: string, title: string, icon: string) => ({
  path: pageCode,
  loadComponent: loadPlaceholder,
  canActivate: [pageAccessGuard],
  data: { pageCode, title, icon },
});

export const routes: Routes = [
  // ── Auth (outside any workspace) ──
  {
    path: 'login',
    loadComponent: () => import('./login/login').then(m => m.Login),
  },
  {
    path: 'change-password',
    loadComponent: () => import('./change-password/change-password').then(m => m.ChangePassword),
    canActivate: [changePasswordGuard],
  },

  // ── Workspace picker (post-auth landing) ──
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./workspace-picker/workspace-picker').then(m => m.WorkspacePicker),
    canActivate: [authGuard],
  },

  // ── Settings — cross-workspace (signed-in users) ──
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings').then(m => m.Settings),
    canActivate: [authGuard],
    data: { pageCode: 'settings', title: 'Settings', icon: '⚙️' },
  },

  // ── Hardware workspace (placeholder) ──
  {
    path: 'hardware',
    loadComponent: () => import('./hardware/hardware').then(m => m.Hardware),
    canActivate: [authGuard, workspaceGuard],
    data: { workspace: 'hardware' },
  },

  // ── Milling workspace — the rice/grain ERP we built ──
  {
    path: 'milling',
    loadComponent: () => import('./shell/shell').then(m => m.Shell),
    canActivate: [authGuard, workspaceGuard],
    data: { workspace: 'milling' },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Overview
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard').then(m => m.Dashboard),
      },

      // Admin Console — rendered inside the workspace shell so the sidebar
      // and topbar stay put. Admin-only via pageAccessGuard.
      {
        path: 'admin',
        loadComponent: () => import('./admin/admin').then(m => m.Admin),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'admin-users', title: 'Admin', icon: '🛡️' },
      },

      // Operations
      {
        path: 'weighbridge',
        loadComponent: () => import('./weighbridge/weighbridge').then(m => m.Weighbridge),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'weighbridge' },
      },
      {
        path: 'milling',
        loadComponent: () => import('./milling/milling').then(m => m.Milling),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'milling' },
      },
      {
        path: 'inventory',
        loadComponent: () => import('./inventory/inventory').then(m => m.Inventory),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'inventory' },
      },
      {
        path: 'quality-inspection',
        loadComponent: () => import('./quality-inspection/quality-inspection').then(m => m.QualityInspection),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'quality-inspection' },
      },

      // Sales
      {
        path: 'customers',
        loadComponent: () => import('./customers/customers').then(m => m.Customers),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'customers' },
      },
      {
        path: 'sales-orders',
        loadComponent: () => import('./sales-orders/sales-orders').then(m => m.SalesOrders),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'sales-orders' },
      },
      {
        path: 'deliveries',
        loadComponent: () => import('./deliveries/deliveries').then(m => m.Deliveries),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'deliveries' },
      },
      {
        path: 'sales-invoices',
        loadComponent: () => import('./sales-invoices/sales-invoices').then(m => m.SalesInvoices),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'sales-invoices' },
      },
      {
        path: 'collections',
        loadComponent: () => import('./collections/collections').then(m => m.Collections),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'collections' },
      },
      {
        path: 'accounts-receivable',
        loadComponent: () => import('./accounts-receivable/accounts-receivable').then(m => m.AccountsReceivable),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'accounts-receivable' },
      },
      {
        path: 'dcpr',
        loadComponent: () => import('./dcpr/dcpr').then(m => m.Dcpr),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'dcpr' },
      },

      // Procurement
      {
        path: 'suppliers',
        loadComponent: () => import('./suppliers/suppliers').then(m => m.Suppliers),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'suppliers' },
      },
      {
        path: 'purchase-requests',
        loadComponent: () => import('./purchase-requests/purchase-requests').then(m => m.PurchaseRequests),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'purchase-requests' },
      },
      {
        path: 'canvasses',
        loadComponent: () => import('./canvasses/canvasses').then(m => m.Canvasses),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'canvasses' },
      },
      {
        path: 'purchase-orders',
        loadComponent: () => import('./purchase-orders/purchase-orders').then(m => m.PurchaseOrders),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'purchase-orders' },
      },
      {
        path: 'goods-receipts',
        loadComponent: () => import('./goods-receipts/goods-receipts').then(m => m.GoodsReceipts),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'goods-receipts' },
      },
      {
        path: 'supplier-invoices',
        loadComponent: () => import('./supplier-invoices/supplier-invoices').then(m => m.SupplierInvoices),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'supplier-invoices' },
      },
      {
        path: 'items',
        loadComponent: () => import('./items/items').then(m => m.Items),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'items' },
      },
      {
        path: 'warehouses',
        loadComponent: () => import('./warehouses/warehouses').then(m => m.Warehouses),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'warehouses' },
      },

      // Importation
      ph('importation', 'Shipments', '🚢'),

      // Accounting
      {
        path: 'chart-of-accounts',
        loadComponent: () => import('./chart-of-accounts/chart-of-accounts').then(m => m.ChartOfAccounts),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'chart-of-accounts' },
      },
      {
        path: 'help-center',
        loadComponent: () => import('./help-center/help-center').then(m => m.HelpCenter),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'help-center' },
      },
      {
        path: 'general-ledger',
        loadComponent: () => import('./general-ledger/general-ledger').then(m => m.GeneralLedger),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'general-ledger' },
      },
      {
        path: 'accounts-payable',
        loadComponent: () => import('./accounts-payable/accounts-payable').then(m => m.AccountsPayable),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'accounts-payable' },
      },
      {
        path: 'bir-compliance',
        loadComponent: () => import('./bir-compliance/bir-compliance').then(m => m.BirCompliance),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'bir-compliance' },
      },

      // Treasury
      {
        path: 'check-voucher',
        loadComponent: () => import('./check-voucher/check-voucher').then(m => m.CheckVoucher),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'check-voucher' },
      },
      {
        path: 'treasury',
        loadComponent: () => import('./cash-position/cash-position').then(m => m.CashPosition),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'treasury', title: 'Cash Position', icon: '🏦' },
      },

      // HR & Reports
      ph('hr',      'Employees', '👤'),
      ph('payroll', 'Payroll',   '💼'),
      ph('reports', 'Reports',   '📈'),
      {
        path: 'vendos',
        loadComponent: () => import('./vendos/vendos').then(m => m.Vendos),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'vendos' },
      },
    ],
  },

  // ── Catch-all → workspace picker ──
  { path: '**', redirectTo: '' },
];
