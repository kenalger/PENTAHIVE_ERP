import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { supabase } from '../supabase.client';

interface Invoice {
  id: string;
  no: string;
  so_id: string | null;
  so_no?: string;
  customer_id?: string | null;
  customer_name?: string;
  invoice_amt: number;
  vat_amt: number;
  amount_due: number;
  invoice_date: string;
  due_date: string | null;
  status: string;
}

interface Collection {
  id: string;
  or_no: string;
  ts: string;
  customer_name?: string;
  invoice_no?: string;
  gross: number;
  ewt: number;
  net: number;
  mode: string;
  status: string;
}

@Component({
  selector: 'app-accounts-receivable',
  imports: [RouterLink],
  template: `
    <div class="krow k4">
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">Open Invoices</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">Awaiting collection</div></div>
      <div class="kc kc-b"><span class="kc-ico">💰</span><div class="kc-lbl">Outstanding AR</div><div class="kc-val">{{ peso(kpis().outstanding) }}</div><div class="kc-sub">Unpaid invoice value</div></div>
      <div class="kc kc-a"><span class="kc-ico">📥</span><div class="kc-lbl">Collected MTD</div><div class="kc-val">{{ peso(kpis().collectedMtd) }}</div><div class="kc-sub">Net of EWT</div></div>
      <div class="kc kc-r"><span class="kc-ico">⏰</span><div class="kc-lbl">Overdue</div><div class="kc-val">{{ kpis().overdue }}</div><div class="kc-sub">Past due date</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Sales Invoices</div>
        <a class="ph-btn ph-btn-sm" [routerLink]="['/', 'milling', 'sales-invoices']">Manage in Sales Invoices →</a>
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (invoices().length === 0) {
        <div class="empty">
          <div class="ico">🧾</div>
          <div class="title">No sales invoices yet</div>
          <div class="hint">Invoice a confirmed or delivered sales order in the Sales Invoices page.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>SI No.</th><th>Date</th><th>SO Ref</th><th>Customer</th><th class="tr">Net</th><th class="tr">VAT</th><th class="tr">Amount Due</th><th>Status</th></tr></thead>
            <tbody>
              @for (i of invoices(); track i.id) {
                <tr>
                  <td class="mono tb">{{ i.no }}</td>
                  <td class="sub mono">{{ i.invoice_date }}</td>
                  <td class="mono">{{ i.so_no || '—' }}</td>
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

    <div class="card">
      <div class="card-h">
        <div class="card-t">Collections / Official Receipts</div>
        <a class="ph-btn ph-btn-sm" [routerLink]="['/', 'milling', 'collections']">Manage in Collections →</a>
      </div>
      @if (!loading() && collections().length === 0) {
        <div class="empty"><div class="ico">📥</div><div class="title">No collections yet</div><div class="hint">Record a payment against an open invoice in the Collections page.</div></div>
      } @else if (collections().length > 0) {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>OR No.</th><th>Date</th><th>Customer</th><th>Invoice</th><th class="tr">Gross</th><th class="tr">EWT</th><th class="tr">Net</th><th>Mode</th></tr></thead>
            <tbody>
              @for (c of collections(); track c.id) {
                <tr>
                  <td class="mono tb">{{ c.or_no }}</td>
                  <td class="sub mono">{{ c.ts.slice(0,10) }}</td>
                  <td>{{ c.customer_name || '—' }}</td>
                  <td class="mono">{{ c.invoice_no || '—' }}</td>
                  <td class="mono tr">{{ peso(c.gross) }}</td>
                  <td class="mono tr sub">{{ peso(c.ewt) }}</td>
                  <td class="mono tr fw6 tg">{{ peso(c.net) }}</td>
                  <td class="sub">{{ c.mode }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .kc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 20px; position: relative; overflow: hidden; }
    .kc::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-err  { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class AccountsReceivable {
  invoices = signal<Invoice[]>([]);
  collections = signal<Collection[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  kpis = computed(() => {
    const inv = this.invoices();
    const col = this.collections();
    const month = new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    const openInv = inv.filter(i => i.status !== 'paid');
    return {
      open: openInv.length,
      outstanding: openInv.reduce((s, i) => s + Number(i.amount_due), 0),
      collectedMtd: col.filter(c => c.ts.startsWith(month)).reduce((s, c) => s + Number(c.net), 0),
      overdue: openInv.filter(i => i.due_date && i.due_date < today).length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [inv, col] = await Promise.all([
      supabase.from('sales_invoices')
        .select('id, no, so_id, invoice_amt, vat_amt, amount_due, invoice_date, due_date, status, sales_orders(no, customer_id, customers(name))')
        .order('created_at', { ascending: false }),
      supabase.from('collections')
        .select('id, or_no, ts, gross, ewt, net, mode, status, customers(name), sales_invoices(no)')
        .order('ts', { ascending: false }),
    ]);
    this.loading.set(false);
    if (inv.error) { this.error.set(inv.error.message); return; }

    this.invoices.set((inv.data ?? []).map((i: any) => ({
      ...i,
      so_no: i.sales_orders?.no,
      customer_id: i.sales_orders?.customer_id ?? null,
      customer_name: i.sales_orders?.customers?.name,
    })) as Invoice[]);

    this.collections.set((col.data ?? []).map((c: any) => ({
      ...c,
      customer_name: c.customers?.name,
      invoice_no: c.sales_invoices?.no,
    })) as Collection[]);
  }

  peso(n: number) { return '₱' + Math.round(Number(n) || 0).toLocaleString(); }
  invStatusLabel(s: string) { return s === 'paid' ? 'Paid' : s === 'overdue' ? 'Overdue' : 'Current'; }
  invStatusClass(s: string) { return 'bs ' + (s === 'paid' ? 's-ok' : s === 'overdue' ? 's-err' : 's-warn'); }
}
