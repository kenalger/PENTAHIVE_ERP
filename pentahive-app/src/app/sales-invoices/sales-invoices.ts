import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

interface Invoice {
  id: string;
  no: string;
  so_id: string | null;
  so_no: string | null;
  customer_id: string | null;
  customer_name: string | null;
  invoice_amt: number;
  vat_amt: number;
  amount_due: number;
  invoice_date: string;
  due_date: string | null;
  status: string;
}

interface SOOption {
  id: string;
  no: string;
  customer_id: string | null;
  customer_name: string;
  status: string;
}

interface SILine {
  so_line_id: string;
  item_id: string | null;
  product: string;
  amount: number;
  vat: number;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPTY_SI = () => ({
  so_id: '',
  invoice_date: todayIso(),
  due_date: '',
  lines: [] as SILine[],
});

@Component({
  selector: 'app-sales-invoices',
  imports: [FormsModule, RouterLink, Modal, Icon],
  template: `
    <div class="krow k3">
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">Open Invoices</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">Awaiting collection</div></div>
      <div class="kc kc-b"><span class="kc-ico">💰</span><div class="kc-lbl">Outstanding AR</div><div class="kc-val">{{ peso(kpis().outstanding) }}</div><div class="kc-sub">Unpaid invoice value</div></div>
      <div class="kc kc-a"><span class="kc-ico">🏛️</span><div class="kc-lbl">VAT This Period</div><div class="kc-val">{{ peso(kpis().vatMtd) }}</div><div class="kc-sub">Output VAT, invoices MTD</div></div>
    </div>

    @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
    @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
    @else {

      @if (soOptions().length > 0 && auth.canDo('sales-invoices','create')) {
        <div class="card mb">
          <div class="card-h"><div class="card-t">Ready to Invoice</div><div class="sub" style="font-size:11px">Confirmed / delivered SOs not yet invoiced</div></div>
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>SO No.</th><th>Customer</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (s of soOptions(); track s.id) {
                  <tr>
                    <td class="mono tb">{{ s.no }}</td>
                    <td>{{ s.customer_name }}</td>
                    <td class="sub">{{ s.status }}</td>
                    <td class="tr"><button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreateSI(s)">Create Invoice</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <div class="card">
        <div class="card-h">
          <div class="card-t">Sales Invoice Register</div>
          <div class="filters">
            <div class="srch">
              <app-icon name="search" [size]="15" />
              <input class="ph-input" [(ngModel)]="search" name="search" placeholder="Search invoice / customer / SO…" />
            </div>
            <select class="ph-select" [(ngModel)]="statusFilter" name="status">
              <option value="all">All statuses</option>
              <option value="current">Current</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        @if (filtered().length === 0) {
          <div class="empty">
            <div class="ico">🧾</div>
            <div class="title">{{ invoices().length === 0 ? 'No sales invoices yet' : 'No matches' }}</div>
            <div class="hint">{{ invoices().length === 0 ? 'Invoice a confirmed or delivered sales order above to post AR.' : 'Adjust your search or status filter.' }}</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>SI No.</th><th>Date</th><th>Due</th><th>SO Ref</th><th>Customer</th><th class="tr">Invoice Amt</th><th class="tr">VAT</th><th class="tr">Amount Due</th><th>Status</th></tr></thead>
              <tbody>
                @for (i of filtered(); track i.id) {
                  <tr>
                    <td class="mono tb">{{ i.no }}</td>
                    <td class="sub mono">{{ i.invoice_date }}</td>
                    <td class="sub mono">{{ i.due_date || '—' }}</td>
                    <td class="mono sub">{{ i.so_no || '—' }}</td>
                    <td>{{ i.customer_name || '—' }}</td>
                    <td class="mono tr">{{ peso(i.invoice_amt) }}</td>
                    <td class="mono tr sub">{{ peso(i.vat_amt) }}</td>
                    <td class="mono tr fw6 tg">{{ peso(i.amount_due) }}</td>
                    <td><span [class]="invStatusClass(i.status)">{{ invStatusLabel(i.status) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <p class="hint-link">Record payments against open invoices in <a [routerLink]="['/', 'milling', 'collections']">Collections →</a></p>
    }

    <app-modal [open]="showSI()" [title]="'Create Sales Invoice'" (closed)="closeSI()">
      <form (ngSubmit)="saveSI()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Source Sales Order *</label>
            <select class="ph-select" [(ngModel)]="si.so_id" name="so" required (change)="onSOChange()">
              <option value="">— Select a confirmed / delivered SO —</option>
              @for (s of soOptions(); track s.id) {
                <option [value]="s.id">{{ s.no }} · {{ s.customer_name }}</option>
              }
            </select>
            @if (soOptions().length === 0) {
              <div class="sub" style="margin-top:6px">No invoiceable SOs. Confirm or deliver a sales order first.</div>
            }
          </div>
          <div class="ph-field">
            <label class="ph-label">Invoice Date</label>
            <input class="ph-input" type="date" [(ngModel)]="si.invoice_date" name="idate" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Due Date</label>
            <input class="ph-input" type="date" [(ngModel)]="si.due_date" name="ddate" />
          </div>
        </div>

        @if (si.lines.length > 0) {
          <div class="lines">
            <div class="lines-h"><span>Invoice lines (from SO)</span></div>
            <table class="ph-table">
              <thead><tr><th>Product</th><th class="tr">Amount (net)</th><th class="tr">VAT</th><th>Treatment</th></tr></thead>
              <tbody>
                @for (l of si.lines; track $index) {
                  <tr>
                    <td>{{ l.product }}</td>
                    <td class="mono tr">{{ peso(l.amount) }}</td>
                    <td class="mono tr sub">{{ peso(l.vat) }}</td>
                    <td><span class="pill" [class.exempt]="l.vat === 0" [class.vatable]="l.vat > 0">{{ l.vat === 0 ? 'VAT-exempt (rice)' : 'VATable' }}</span></td>
                  </tr>
                }
                <tr class="sum-row">
                  <td class="tr sub">Totals</td>
                  <td class="mono tr fw7">{{ peso(siNet()) }}</td>
                  <td class="mono tr fw7">{{ peso(siVat()) }}</td>
                  <td class="mono fw7 tg">Due {{ peso(siDue()) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        }

        @if (siError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ siError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeSI()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="savingSI() || !si.so_id || si.lines.length === 0">
            {{ savingSI() ? 'Posting…' : 'Post Invoice' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .kc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 20px; position: relative; overflow: hidden; }
    .kc::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 24px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .filters { display: flex; align-items: center; gap: 10px; }
    .srch { display: flex; align-items: center; gap: 8px; }
    .srch app-icon { color: var(--sub); }
    .srch .ph-input { min-width: 240px; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .hint-link { font-size: 12px; color: var(--sub); margin-top: 14px; }
    .hint-link a { color: var(--gold); font-weight: 600; text-decoration: none; }
    .hint-link a:hover { text-decoration: underline; }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .lines { margin-top: 18px; }
    .lines-h { font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
    .sum-row td { background: var(--raised); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: var(--raised); color: var(--sub); }
    .pill.exempt  { background: var(--local-bg);  color: var(--local-deep); }
    .pill.vatable { background: var(--sky-bg);    color: var(--sky); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-err  { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class SalesInvoices {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  invoices = signal<Invoice[]>([]);
  soOptions = signal<SOOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  search = '';
  statusFilter: 'all' | 'current' | 'paid' = 'all';

  showSI = signal(false);
  savingSI = signal(false);
  siError = signal<string | null>(null);
  si = EMPTY_SI();

  kpis = computed(() => {
    const inv = this.invoices();
    const month = todayIso().slice(0, 7);
    const openInv = inv.filter(i => i.status !== 'paid');
    return {
      open: openInv.length,
      outstanding: openInv.reduce((s, i) => s + Number(i.amount_due), 0),
      vatMtd: inv.filter(i => i.invoice_date.startsWith(month)).reduce((s, i) => s + Number(i.vat_amt), 0),
    };
  });

  // search/statusFilter are plain [(ngModel)] fields, not signals; recomputing in a
  // method (not computed()) keeps the list tracking edits live in this zoneless app.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.invoices().filter(i => {
      if (this.statusFilter !== 'all' && i.status !== this.statusFilter) return false;
      if (!q) return true;
      return [i.no, i.customer_name, i.so_no].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }

  // Methods, not computed(): they read `this.si`, a plain [(ngModel)]-bound object that
  // is NOT a signal. A computed() over a non-reactive source evaluates once and freezes.
  siNet() { return this.si.lines.reduce((s, l) => s + Number(l.amount), 0); }
  siVat() { return this.si.lines.reduce((s, l) => s + Number(l.vat), 0); }
  siDue() { return this.siNet() + this.siVat(); }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [inv, so] = await Promise.all([
      supabase.from('sales_invoices')
        .select('id, no, so_id, invoice_amt, vat_amt, amount_due, invoice_date, due_date, status, sales_orders(no, customer_id, customers(name))')
        .order('created_at', { ascending: false }),
      supabase.from('sales_orders')
        .select('id, no, customer_id, status, customers(name)')
        .in('status', ['confirmed', 'in_transit', 'delivered'])
        .order('created_at', { ascending: false }),
    ]);
    this.loading.set(false);
    if (inv.error) { this.error.set(inv.error.message); return; }

    const invoiced = new Set((inv.data ?? []).map((i: any) => i.so_id).filter(Boolean));

    this.invoices.set((inv.data ?? []).map((i: any) => ({
      id: i.id, no: i.no, so_id: i.so_id,
      so_no: i.sales_orders?.no ?? null,
      customer_id: i.sales_orders?.customer_id ?? null,
      customer_name: i.sales_orders?.customers?.name ?? null,
      invoice_amt: Number(i.invoice_amt), vat_amt: Number(i.vat_amt), amount_due: Number(i.amount_due),
      invoice_date: i.invoice_date, due_date: i.due_date, status: i.status,
    })) as Invoice[]);

    // Hide SOs that already have an invoice (prevents double-invoicing).
    this.soOptions.set((so.data ?? [])
      .filter((s: any) => !invoiced.has(s.id))
      .map((s: any) => ({ id: s.id, no: s.no, customer_id: s.customer_id, customer_name: s.customers?.name ?? '—', status: s.status })) as SOOption[]);
  }

  openCreateSI(s?: SOOption) {
    this.si = EMPTY_SI();
    this.siError.set(null);
    this.showSI.set(true);
    if (s) { this.si.so_id = s.id; this.onSOChange(); }
  }
  closeSI() { this.showSI.set(false); }

  async onSOChange() {
    if (!this.si.so_id) { this.si.lines = []; return; }
    const { data, error } = await supabase
      .from('so_lines')
      .select('id, item_id, product, amount, vat')
      .eq('so_id', this.si.so_id)
      .order('line_no');
    if (error) { this.siError.set(error.message); return; }
    this.si.lines = (data ?? []).map((l: any) => ({
      so_line_id: l.id,
      item_id: l.item_id,
      product: l.product,
      amount: Number(l.amount) || 0,
      vat: Number(l.vat) || 0,
    }));
    // si is a plain [(ngModel)] object, not a signal; in this zoneless app nothing
    // schedules CD after the await, so the loaded lines/totals would not render until
    // an unrelated field is touched. Force a tick.
    this.cdr.markForCheck();
  }

  async saveSI() {
    if (!this.si.so_id || this.si.lines.length === 0) { this.siError.set('Pick an SO with lines.'); return; }
    this.savingSI.set(true);
    this.siError.set(null);

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'SI' });
    if (noErr || !noData) { this.siError.set(noErr?.message || 'Failed to generate SI number'); this.savingSI.set(false); return; }

    // Header totals derived from the same lines we insert, so the GL entry balances.
    const net = this.siNet();
    const vat = this.siVat();
    const due = net + vat;

    const { data: siRow, error: siErr } = await supabase.from('sales_invoices').insert({
      no: noData as string,
      so_id: this.si.so_id,
      invoice_amt: net,
      vat_amt: vat,
      amount_due: due,
      invoice_date: this.si.invoice_date,
      due_date: this.si.due_date || null,
      status: 'current',
    }).select('id').single();

    if (siErr || !siRow) { this.siError.set(siErr?.message || 'Failed to create invoice'); this.savingSI.set(false); return; }

    // Line insert fires the SINV bridge (posts the JE, bumps ar_balance / ytd_sales).
    const linePayloads = this.si.lines.map((l, i) => ({
      si_id: siRow.id,
      so_line_id: l.so_line_id,
      item_id: l.item_id,
      product: l.product,
      amount: Number(l.amount),
      vat: Number(l.vat),
      line_no: i + 1,
    }));
    const { error: linesErr } = await supabase.from('sales_invoice_lines').insert(linePayloads);
    if (linesErr) { this.siError.set('Header saved but lines failed (no GL posted): ' + linesErr.message); this.savingSI.set(false); return; }

    this.savingSI.set(false);
    this.closeSI();
    await this.load();
  }

  peso(n: number) { return '₱' + Math.round(Number(n) || 0).toLocaleString(); }
  invStatusLabel(s: string) { return s === 'paid' ? 'Paid' : s === 'overdue' ? 'Overdue' : 'Current'; }
  invStatusClass(s: string) { return 'bs ' + (s === 'paid' ? 's-ok' : s === 'overdue' ? 's-err' : 's-warn'); }
}
