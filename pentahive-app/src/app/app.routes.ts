import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { changePasswordGuard } from './change-password.guard';
import { pageAccessGuard } from './page-access.guard';

const loadPlaceholder = () => import('./placeholder/placeholder').then(m => m.Placeholder);

const ph = (pageCode: string, title: string, icon: string) => ({
  path: pageCode,
  loadComponent: loadPlaceholder,
  canActivate: [pageAccessGuard],
  data: { pageCode, title, icon },
});

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login').then(m => m.Login),
  },
  {
    path: 'change-password',
    loadComponent: () => import('./change-password/change-password').then(m => m.ChangePassword),
    canActivate: [changePasswordGuard],
  },

  {
    path: '',
    loadComponent: () => import('./shell/shell').then(m => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Overview
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard').then(m => m.Dashboard),
      },

      // Operations
      ph('weighbridge',        'Weighbridge',        '⚖️'),
      ph('milling',            'Milling',            '⚙️'),
      ph('inventory',          'Inventory',          '🏪'),
      ph('quality-inspection', 'Quality Inspection', '🔬'),

      // Sales
      {
        path: 'customers',
        loadComponent: () => import('./customers/customers').then(m => m.Customers),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'customers' },
      },
      ph('sales-orders',        'Sales Orders',       '🧾'),
      ph('deliveries',          'Delivery',           '🚛'),
      ph('accounts-receivable', 'Accounts Receivable','💰'),
      ph('dcpr',                'DCPR',               '📒'),

      // Procurement
      {
        path: 'suppliers',
        loadComponent: () => import('./suppliers/suppliers').then(m => m.Suppliers),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'suppliers' },
      },
      ph('purchase-requests', 'Purchase Requests', '📝'),
      ph('canvasses',         'Canvasses',         '📋'),
      ph('purchase-orders',   'Purchase Orders',   '📦'),
      ph('goods-receipts',    'Goods Receipt',     '📥'),
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
      ph('general-ledger',   'General Ledger',   '📊'),
      ph('accounts-payable', 'Accounts Payable', '💳'),
      ph('bir-compliance',   'BIR Compliance',   '🏛️'),

      // Treasury
      ph('treasury', 'Cash Position', '🏦'),

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

      // Admin
      {
        path: 'admin/users',
        loadComponent: () => import('./admin/users/users').then(m => m.Users),
        canActivate: [pageAccessGuard],
        data: { pageCode: 'admin-users' },
      },
      {
        path: 'admin/access',
        loadComponent: loadPlaceholder,
        canActivate: [pageAccessGuard],
        data: { pageCode: 'admin-access', title: 'Admin — Access', icon: '🔑' },
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
