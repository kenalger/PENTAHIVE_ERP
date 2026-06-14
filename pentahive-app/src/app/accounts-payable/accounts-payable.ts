import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';

interface Bill {
  id: string;
  no: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_inv_no: string | null;
  invoice_date: string;
  due_date: string | null;
  gross_amt: number;
  ewt_amt: number;
  net_payable: number;
  status: 'open' | 'partial' | 'paid';
}

interface CheckVoucher {
  id: string;
  no: string;
  supplier_name: string | null;
  payment_date: string;
  amount: number;
  mode: string;
  cash_account_name: string | null;
  check_no: string | null;
  status: string;
}

interface BillableGRN {
  grn_id: string;
}

@Component({
  selector: 'app-accounts-payable',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="krow k4">
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">Unpaid Bills</div><div class="kc-val">{{ kpis().unpaidBills }}</div><div class="kc-sub">Open + partial</div></div>
      <div class="kc kc-a"><span class="kc-ico">💰</span><div class="kc-lbl">AP Outstanding</div><div class="kc-val">{{ fmt(kpis().apOutstanding) }}</div><div class="kc-sub">Net payable, unpaid bills</div></div>
      <div class="kc kc-b"><span class="kc-ico">📥</span><div class="kc-lbl">To Bill</div><div class="kc-val">{{ billableCount() }}</div><div class="kc-sub">Received GRNs not yet billed</div></div>
      <div class="kc kc-r"><span class="kc-ico">🏦</span><div class="kc-lbl">Disbursed MTD</div><div class="kc-val">{{ fmt(kpis().disbursedMtd) }}</div><div class="kc-sub">Posted CVs this month</div></div>
    </div>

    <div class="tabs mb">
      <button class="tab" [class.active]="tab() === 'bills'" (click)="tab.set('bills')">Supplier Bills</button>
      <button class="tab" [class.active]="tab() === 'payments'" (click)="tab.set('payments')">Check Vouchers</button>
    </div>

    @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
    @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
    @else {

      @if (tab() === 'bills') {
        <div class="card mb">
          <div class="card-h">
            <div class="card-t">Supplier Bill Register</div>
            <a class="ph-btn ph-btn-sm" [routerLink]="['/', 'milling', 'supplier-invoices']">Manage in Supplier Invoices →</a>
          </div>
          @if (bills().length === 0) {
            <div class="empty">
              <div class="ico">🧾</div>
              <div class="title">No supplier bills yet</div>
              <div class="hint">Enter a bill from a received GRN in the Supplier Invoices page.</div>
            </div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead><tr><th>Bill No.</th><th>Supplier</th><th>Their Inv #</th><th>Date</th><th class="tr">Gross</th><th class="tr">EWT</th><th class="tr">Net Payable</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  @for (b of bills(); track b.id) {
                    <tr>
                      <td class="mono ta">{{ b.no }}</td>
                      <td>{{ b.supplier_name || '—' }}</td>
                      <td class="mono sub">{{ b.supplier_inv_no || '—' }}</td>
                      <td class="sub mono">{{ b.invoice_date }}</td>
                      <td class="mono tr">{{ fmt(b.gross_amt) }}</td>
                      <td class="mono tr sub">{{ fmt(b.ewt_amt) }}</td>
                      <td class="mono tr tb">{{ fmt(b.net_payable) }}</td>
                      <td><span [class]="statusClass(b.status)">{{ statusLabel(b.status) }}</span></td>
                      <td class="tr">
                        @if (b.status !== 'paid' && auth.canDo('check-voucher','create')) {
                          <button class="ph-btn ph-btn-sm" (click)="payViaCv(b)">Pay</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      @if (tab() === 'payments') {
        <div class="card mb">
          <div class="card-h">
            <div class="card-t">Check Voucher Register</div>
            <a class="ph-btn ph-btn-sm" [routerLink]="['/', 'milling', 'check-voucher']">Open Check Voucher →</a>
          </div>
          @if (payments().length === 0) {
            <div class="empty">
              <div class="ico">🏦</div>
              <div class="title">No check vouchers yet</div>
              <div class="hint">Issue a CV from the Check Voucher page to pay unpaid bills.</div>
            </div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead><tr><th>CV No.</th><th>Supplier</th><th>Date</th><th class="tr">Total</th><th>Mode</th><th>Cash Account</th><th>Check #</th><th>Status</th></tr></thead>
                <tbody>
                  @for (p of payments(); track p.id) {
                    <tr>
                      <td class="mono ta">{{ p.no }}</td>
                      <td>{{ p.supplier_name || '—' }}</td>
                      <td class="sub mono">{{ p.payment_date }}</td>
                      <td class="mono tr tb">{{ fmt(p.amount) }}</td>
                      <td class="sub">{{ p.mode }}</td>
                      <td class="sub">{{ p.cash_account_name || '—' }}</td>
                      <td class="mono sub">{{ p.check_no || '—' }}</td>
                      <td><span [class]="cvStatusClass(p.status)">{{ p.status === 'posted' ? 'Posted' : 'Cancelled' }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    }
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
    .kc-val { font-size: 24px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
    .tab { background: none; border: none; padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--sub); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--text); border-bottom-color: var(--gold); }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-mut { background: var(--raised); color: var(--sub); border: 1px solid var(--border); }
  `,
})
export class AccountsPayable {
  auth = inject(AuthService);
  private router = inject(Router);

  tab = signal<'bills' | 'payments'>('bills');
  bills = signal<Bill[]>([]);
  payments = signal<CheckVoucher[]>([]);
  billableCount = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  kpis = computed(() => {
    const b = this.bills();
    const unpaid = b.filter(x => x.status !== 'paid');
    const month = new Date().toISOString().slice(0, 7);
    return {
      unpaidBills: unpaid.length,
      apOutstanding: unpaid.reduce((s, x) => s + Number(x.net_payable), 0),
      disbursedMtd: this.payments()
        .filter(x => x.status === 'posted' && x.payment_date.startsWith(month))
        .reduce((s, x) => s + Number(x.amount), 0),
    };
  });

  constructor() { this.load(); }

  fmt(n: number) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    const [billsRes, paysRes, billedRes] = await Promise.all([
      supabase.from('supplier_invoices')
        .select('id, no, supplier_id, supplier_inv_no, invoice_date, due_date, gross_amt, ewt_amt, net_payable, status, suppliers(name)')
        .order('created_at', { ascending: false }),
      supabase.from('supplier_payments')
        .select('id, no, payment_date, amount, mode, check_no, status, suppliers(name), acc_titles(acc_name)')
        .order('created_at', { ascending: false }),
      supabase.from('supplier_invoices').select('grn_id'),
    ]);

    if (billsRes.error) { this.error.set(billsRes.error.message); this.loading.set(false); return; }

    this.bills.set((billsRes.data ?? []).map((b: any) => ({
      id: b.id, no: b.no, supplier_id: b.supplier_id, supplier_name: b.suppliers?.name ?? null,
      supplier_inv_no: b.supplier_inv_no, invoice_date: b.invoice_date, due_date: b.due_date,
      gross_amt: Number(b.gross_amt), ewt_amt: Number(b.ewt_amt), net_payable: Number(b.net_payable),
      status: b.status,
    })));

    this.payments.set((paysRes.data ?? []).map((p: any) => ({
      id: p.id, no: p.no, supplier_name: p.suppliers?.name ?? null,
      payment_date: p.payment_date, amount: Number(p.amount), mode: p.mode,
      cash_account_name: p.acc_titles?.acc_name ?? null, check_no: p.check_no, status: p.status,
    })));

    // Posted GRNs that don't yet have a bill (the "To Bill" KPI).
    const billedGrnIds = new Set((billedRes.data ?? []).map((r: any) => r.grn_id).filter(Boolean));
    const { data: grnData } = await supabase.from('goods_receipts')
      .select('id, po_id').eq('status', 'posted');
    this.billableCount.set((grnData ?? [])
      .filter((g: any) => g.po_id && !billedGrnIds.has(g.id)).length);

    this.loading.set(false);
  }

  // Pay now lives in the Check Voucher page; deep-link with the supplier preselected.
  payViaCv(b: Bill) {
    this.router.navigate(['/', 'milling', 'check-voucher'], { queryParams: { supplier: b.supplier_id } });
  }

  statusClass(s: Bill['status']) {
    return 'bs ' + (s === 'paid' ? 's-ok' : s === 'partial' ? 's-warn' : 's-mut');
  }
  statusLabel(s: Bill['status']) {
    return s === 'paid' ? 'Paid' : s === 'partial' ? 'Partial' : 'Open';
  }
  cvStatusClass(s: string) { return 'bs ' + (s === 'posted' ? 's-ok' : 's-mut'); }
}
