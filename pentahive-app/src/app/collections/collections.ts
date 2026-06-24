import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

interface Collection {
  id: string;
  or_no: string;
  ts: string;
  customer_name: string | null;
  invoice_no: string | null;
  gross: number;
  ewt: number;
  net: number;
  mode: string;
  status: string;
}

interface OpenInvoice {
  id: string;
  no: string;
  customer_id: string | null;
  customer_name: string | null;
  amount_due: number;
  invoice_date: string;
}

const EMPTY_PAY = () => ({
  invoice_id: '',
  customer_id: null as string | null,
  customer_name: '',
  invoice_no: '',
  gross: 0,
  ewt: 0,
  mode: 'bank',
});

@Component({
  selector: 'app-collections',
  imports: [FormsModule, RouterLink, Modal, Icon],
  template: `
    <div class="krow k3">
      <div class="kc kc-a"><span class="kc-ico">📥</span><div class="kc-lbl">Collected This Period</div><div class="kc-val">{{ peso(kpis().collectedMtd) }}</div><div class="kc-sub">Net of EWT, MTD</div></div>
      <div class="kc kc-b"><span class="kc-ico">🏛️</span><div class="kc-lbl">CWT Withheld</div><div class="kc-val">{{ peso(kpis().ewtMtd) }}</div><div class="kc-sub">Creditable WT, MTD</div></div>
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">Open Invoices</div><div class="kc-val">{{ openInvoices().length }}</div><div class="kc-sub">Awaiting collection</div></div>
    </div>

    @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
    @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
    @else {

      @if (openInvoices().length > 0 && auth.canDo('collections','create')) {
        <div class="card mb">
          <div class="card-h"><div class="card-t">Ready to Collect</div><div class="sub" style="font-size:11px">Open sales invoices</div></div>
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>SI No.</th><th>Date</th><th>Customer</th><th class="tr">Amount Due</th><th></th></tr></thead>
              <tbody>
                @for (i of openInvoices(); track i.id) {
                  <tr>
                    <td class="mono tb">{{ i.no }}</td>
                    <td class="sub mono">{{ i.invoice_date }}</td>
                    <td>{{ i.customer_name || '—' }}</td>
                    <td class="mono tr fw6 tg">{{ peso(i.amount_due) }}</td>
                    <td class="tr"><button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openPay(i)">Receive Payment</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <div class="card">
        <div class="card-h">
          <div class="card-t">Collections / Official Receipts</div>
          <div class="filters">
            <div class="srch">
              <app-icon name="search" [size]="15" />
              <input class="ph-input" [(ngModel)]="search" name="search" placeholder="Search OR / customer / invoice…" />
            </div>
            <select class="ph-select" [(ngModel)]="modeFilter" name="mode">
              <option value="all">All modes</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="check">Check</option>
              <option value="gcash">GCash</option>
            </select>
          </div>
        </div>
        @if (filtered().length === 0) {
          <div class="empty">
            <div class="ico">📥</div>
            <div class="title">{{ collections().length === 0 ? 'No collections yet' : 'No matches' }}</div>
            <div class="hint">{{ collections().length === 0 ? 'Receive a payment against an open invoice above.' : 'Adjust your search or mode filter.' }}</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>OR No.</th><th>Date</th><th>Customer</th><th>Invoice</th><th class="tr">Gross</th><th class="tr">EWT</th><th class="tr">Net</th><th>Mode</th><th>Status</th></tr></thead>
              <tbody>
                @for (c of filtered(); track c.id) {
                  <tr>
                    <td class="mono tb">{{ c.or_no }}</td>
                    <td class="sub mono">{{ c.ts.slice(0,10) }}</td>
                    <td>{{ c.customer_name || '—' }}</td>
                    <td class="mono sub">{{ c.invoice_no || '—' }}</td>
                    <td class="mono tr">{{ peso(c.gross) }}</td>
                    <td class="mono tr sub">{{ peso(c.ewt) }}</td>
                    <td class="mono tr fw6 tg">{{ peso(c.net) }}</td>
                    <td class="sub">{{ c.mode }}</td>
                    <td><span class="bs s-ok">{{ c.status }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <p class="hint-link">Issue invoices in <a [routerLink]="['/', 'milling', 'sales-invoices']">Sales Invoices →</a></p>
    }

    <app-modal [open]="showPay()" [title]="'Receive Payment'" (closed)="closePay()">
      <form (ngSubmit)="savePay()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Invoice</label>
            <input class="ph-input" [value]="pay.invoice_no + ' · ' + pay.customer_name" name="inv" readonly />
          </div>
          <div class="ph-field">
            <label class="ph-label">Gross *</label>
            <input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="pay.gross" name="gross" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">EWT</label>
            <input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="pay.ewt" name="ewt" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Net (received)</label>
            <input class="ph-input mono tr" [value]="peso(payNet())" name="net" readonly />
          </div>
          <div class="ph-field">
            <label class="ph-label">Mode</label>
            <select class="ph-select" [(ngModel)]="pay.mode" name="mode">
              <option value="bank">Bank Transfer</option>
              <option value="check">Check</option>
              <option value="gcash">GCash</option>
              <option value="cash">Cash</option>
            </select>
          </div>
        </div>

        @if (payError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ payError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closePay()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="savingPay() || pay.gross <= 0">
            {{ savingPay() ? 'Posting…' : 'Post Receipt' }}
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
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
  `,
})
export class Collections {
  auth = inject(AuthService);

  collections = signal<Collection[]>([]);
  openInvoices = signal<OpenInvoice[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  search = '';
  modeFilter: 'all' | 'cash' | 'bank' | 'check' | 'gcash' = 'all';

  showPay = signal(false);
  savingPay = signal(false);
  payError = signal<string | null>(null);
  pay = EMPTY_PAY();

  kpis = computed(() => {
    const col = this.collections();
    const month = new Date().toISOString().slice(0, 7);
    const mtd = col.filter(c => c.ts.startsWith(month));
    return {
      collectedMtd: mtd.reduce((s, c) => s + Number(c.net), 0),
      ewtMtd: mtd.reduce((s, c) => s + Number(c.ewt), 0),
    };
  });

  // search/modeFilter are plain [(ngModel)] fields, not signals; recomputing in a
  // method (not computed()) keeps the list tracking edits live in this zoneless app.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.collections().filter(c => {
      if (this.modeFilter !== 'all' && c.mode !== this.modeFilter) return false;
      if (!q) return true;
      return [c.or_no, c.customer_name, c.invoice_no].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }

  // Method, not computed(): reads `this.pay`, a plain [(ngModel)] object (not a signal).
  payNet() { return Math.max(0, Number(this.pay.gross || 0) - Number(this.pay.ewt || 0)); }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [col, inv] = await Promise.all([
      supabase.from('collections')
        .select('id, or_no, ts, gross, ewt, net, mode, status, customers(name), sales_invoices(no)')
        .order('ts', { ascending: false }),
      supabase.from('sales_invoices')
        .select('id, no, amount_due, invoice_date, status, sales_orders(customer_id, customers(name))')
        .neq('status', 'paid')
        .order('created_at', { ascending: false }),
    ]);
    this.loading.set(false);
    if (col.error) { this.error.set(col.error.message); return; }

    this.collections.set((col.data ?? []).map((c: any) => ({
      id: c.id, or_no: c.or_no, ts: c.ts,
      customer_name: c.customers?.name ?? null,
      invoice_no: c.sales_invoices?.no ?? null,
      gross: Number(c.gross), ewt: Number(c.ewt), net: Number(c.net),
      mode: c.mode, status: c.status,
    })) as Collection[]);

    this.openInvoices.set((inv.data ?? []).map((i: any) => ({
      id: i.id, no: i.no, amount_due: Number(i.amount_due), invoice_date: i.invoice_date,
      customer_id: i.sales_orders?.customer_id ?? null,
      customer_name: i.sales_orders?.customers?.name ?? null,
    })) as OpenInvoice[]);
  }

  openPay(i: OpenInvoice) {
    this.pay = EMPTY_PAY();
    this.pay.invoice_id = i.id;
    this.pay.invoice_no = i.no;
    this.pay.customer_id = i.customer_id;
    this.pay.customer_name = i.customer_name ?? '';
    this.pay.gross = Number(i.amount_due);
    this.payError.set(null);
    this.showPay.set(true);
  }
  closePay() { this.showPay.set(false); }

  async savePay() {
    if (this.pay.gross <= 0) { this.payError.set('Gross must be positive.'); return; }
    this.savingPay.set(true);
    this.payError.set(null);

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'OR' });
    if (noErr || !noData) { this.payError.set(noErr?.message || 'Failed to generate OR number'); this.savingPay.set(false); return; }

    // Insert fires the COLL bridge (posts JE, decrements ar_balance, flips SI to paid).
    const { error: colErr } = await supabase.from('collections').insert({
      or_no: noData as string,
      customer_id: this.pay.customer_id,
      invoice_id: this.pay.invoice_id,
      gross: Number(this.pay.gross),
      ewt: Number(this.pay.ewt) || 0,
      mode: this.pay.mode,
      status: 'posted',
    });
    if (colErr) { this.payError.set(colErr.message); this.savingPay.set(false); return; }

    this.savingPay.set(false);
    this.closePay();
    await this.load();
  }

  peso(n: number) { return '₱' + Math.round(Number(n) || 0).toLocaleString(); }
}
