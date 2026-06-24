import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

interface Bill {
  id: string;
  no: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_inv_no: string | null;
  grn_no: string | null;
  po_no: string | null;
  invoice_date: string;
  due_date: string | null;
  gross_amt: number;
  ewt_amt: number;
  net_payable: number;
  status: 'open' | 'partial' | 'paid';
}

interface BillableGRN {
  grn_id: string;
  grn_no: string;
  date: string;
  po_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  ewt_amount: number;
}

interface BillLine {
  grn_line_id: string;
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  line_no: number;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPTY_BILL_FORM = () => ({
  grn_id: '',
  grn_no: '',
  po_id: '',
  supplier_id: '' as string | null,
  supplier_name: '' as string | null,
  supplier_inv_no: '',
  invoice_date: todayIso(),
  due_date: '',
  ewt_amt: 0,
  lines: [] as BillLine[],
});

@Component({
  selector: 'app-supplier-invoices',
  imports: [FormsModule, Modal, Icon],
  template: `
    <div class="krow k3">
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">Open Bills</div><div class="kc-val">{{ kpis().openBills }}</div><div class="kc-sub">Awaiting payment</div></div>
      <div class="kc kc-a"><span class="kc-ico">💰</span><div class="kc-lbl">Open AP</div><div class="kc-val">{{ fmt(kpis().apOutstanding) }}</div><div class="kc-sub">Net payable, open bills</div></div>
      <div class="kc kc-b"><span class="kc-ico">🏛️</span><div class="kc-lbl">EWT to Remit</div><div class="kc-val">{{ fmt(kpis().ewtToRemit) }}</div><div class="kc-sub">Withheld on open bills</div></div>
    </div>

    @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
    @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
    @else {

      @if (billableGRNs().length > 0 && auth.canDo('supplier-invoices','create')) {
        <div class="card mb">
          <div class="card-h"><div class="card-t">Ready to Bill</div><div class="sub" style="font-size:11px">Posted GRNs not yet billed</div></div>
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>GRN No.</th><th>Date</th><th>Supplier</th><th></th></tr></thead>
              <tbody>
                @for (g of billableGRNs(); track g.grn_id) {
                  <tr>
                    <td class="mono ta">{{ g.grn_no }}</td>
                    <td class="sub mono">{{ g.date }}</td>
                    <td>{{ g.supplier_name || '—' }}</td>
                    <td class="tr"><button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openBill(g)">Enter Bill</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <div class="card">
        <div class="card-h">
          <div class="card-t">Supplier Invoice Register</div>
          <div class="filters">
            <div class="srch">
              <app-icon name="search" [size]="15" />
              <input class="ph-input" [(ngModel)]="search" name="search" placeholder="Search bill / supplier / ref…" />
            </div>
            <select class="ph-select" [(ngModel)]="statusFilter" name="status">
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        @if (filtered().length === 0) {
          <div class="empty">
            <div class="ico">🧾</div>
            <div class="title">{{ bills().length === 0 ? 'No supplier invoices yet' : 'No matches' }}</div>
            <div class="hint">{{ bills().length === 0 ? 'Enter a bill from a received GRN above.' : 'Adjust your search or status filter.' }}</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>Bill No.</th><th>Supplier</th><th>GRN / PO</th><th>Their Inv #</th><th>Date</th><th class="tr">Gross</th><th class="tr">EWT</th><th class="tr">Net Payable</th><th>Status</th></tr></thead>
              <tbody>
                @for (b of filtered(); track b.id) {
                  <tr>
                    <td class="mono ta">{{ b.no }}</td>
                    <td>{{ b.supplier_name || '—' }}</td>
                    <td class="mono sub">{{ b.grn_no || b.po_no || '—' }}</td>
                    <td class="mono sub">{{ b.supplier_inv_no || '—' }}</td>
                    <td class="sub mono">{{ b.invoice_date }}</td>
                    <td class="mono tr">{{ fmt(b.gross_amt) }}</td>
                    <td class="mono tr sub">{{ fmt(b.ewt_amt) }}</td>
                    <td class="mono tr tb">{{ fmt(b.net_payable) }}</td>
                    <td><span [class]="statusClass(b.status)">{{ statusLabel(b.status) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <p class="hint-link">Record payments against open bills in <strong>Accounts Payable</strong>.</p>
    }

    <app-modal [open]="showBill()" [title]="'Enter Supplier Bill'" (closed)="closeBill()">
      <form (ngSubmit)="saveBill()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">From GRN</label>
            <input class="ph-input mono" [value]="billForm.grn_no" disabled />
          </div>
          <div class="ph-field">
            <label class="ph-label">Supplier</label>
            <input class="ph-input" [value]="billForm.supplier_name || '—'" disabled />
          </div>
          <div class="ph-field">
            <label class="ph-label">Supplier Invoice #</label>
            <input class="ph-input" [(ngModel)]="billForm.supplier_inv_no" name="supinv" placeholder="Their reference" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Invoice Date *</label>
            <input class="ph-input" type="date" [(ngModel)]="billForm.invoice_date" name="invdate" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Due Date</label>
            <input class="ph-input" type="date" [(ngModel)]="billForm.due_date" name="duedate" />
          </div>
          <div class="ph-field">
            <label class="ph-label">EWT (from PO)</label>
            <input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="billForm.ewt_amt" name="ewt" />
          </div>
        </div>

        @if (billForm.lines.length > 0) {
          <div class="lines">
            <div class="lines-h"><span>Bill lines (GRN qty × PO price)</span></div>
            <table class="ph-table">
              <thead><tr><th>#</th><th>Description</th><th class="tr">Qty</th><th class="tr">Unit Price</th><th class="tr">Amount</th></tr></thead>
              <tbody>
                @for (l of billForm.lines; track l.grn_line_id) {
                  <tr>
                    <td class="mono dim">{{ l.line_no }}</td>
                    <td>{{ l.description }}</td>
                    <td class="mono tr sub">{{ l.qty }}</td>
                    <td class="mono tr sub">{{ fmt(l.unit_price) }}</td>
                    <td class="mono tr">{{ fmt(l.amount) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="tot-row"><span>Gross</span><span class="mono">{{ fmt(grossAmt()) }}</span></div>
            <div class="tot-row"><span>Less: EWT</span><span class="mono">({{ fmt(billForm.ewt_amt) }})</span></div>
            <div class="tot-row strong"><span>Net Payable</span><span class="mono">{{ fmt(netPayable()) }}</span></div>
          </div>
        }

        @if (billError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ billError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeBill()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="savingBill() || billForm.lines.length === 0">
            {{ savingBill() ? 'Posting…' : 'Post Bill' }}
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
    .hint-link strong { color: var(--text); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .lines { margin-top: 18px; }
    .lines-h { font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
    .totals { margin-top: 14px; margin-left: auto; max-width: 260px; }
    .tot-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; color: var(--sub); }
    .tot-row.strong { color: var(--text); font-weight: 700; border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
  `,
})
export class SupplierInvoices {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  bills = signal<Bill[]>([]);
  billableGRNs = signal<BillableGRN[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  search = '';
  statusFilter: 'all' | 'open' | 'partial' | 'paid' = 'all';

  showBill = signal(false);
  savingBill = signal(false);
  billError = signal<string | null>(null);
  billForm = EMPTY_BILL_FORM();

  kpis = computed(() => {
    const b = this.bills();
    const open = b.filter(x => x.status === 'open');
    return {
      openBills: open.length,
      apOutstanding: open.reduce((s, x) => s + Number(x.net_payable), 0),
      // Display-only: total EWT withheld on still-open bills (a remittance proxy).
      ewtToRemit: open.reduce((s, x) => s + Number(x.ewt_amt), 0),
    };
  });

  // search/statusFilter are plain [(ngModel)] fields, not signals; recomputing in a
  // method (not computed()) keeps the list tracking edits live in this zoneless app.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.bills().filter(b => {
      if (this.statusFilter !== 'all' && b.status !== this.statusFilter) return false;
      if (!q) return true;
      return [b.no, b.supplier_name, b.supplier_inv_no, b.grn_no, b.po_no]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  }

  // Methods, not computed(): they read `this.billForm`, a plain [(ngModel)]-bound
  // object that is NOT a signal. A computed() over a non-reactive source evaluates
  // once and never re-runs, so the totals would freeze at 0 as the user edits.
  grossAmt() { return this.billForm.lines.reduce((s, l) => s + Number(l.amount), 0); }
  netPayable() { return this.grossAmt() - Number(this.billForm.ewt_amt || 0); }

  constructor() { this.load(); }

  fmt(n: number) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    const [billsRes, billedRes] = await Promise.all([
      supabase.from('supplier_invoices')
        .select('id, no, supplier_id, supplier_inv_no, invoice_date, due_date, gross_amt, ewt_amt, net_payable, status, suppliers(name), goods_receipts(no), purchase_orders(no)')
        .order('created_at', { ascending: false }),
      supabase.from('supplier_invoices').select('grn_id'),
    ]);

    if (billsRes.error) { this.error.set(billsRes.error.message); this.loading.set(false); return; }

    this.bills.set((billsRes.data ?? []).map((b: any) => ({
      id: b.id, no: b.no, supplier_id: b.supplier_id, supplier_name: b.suppliers?.name ?? null,
      supplier_inv_no: b.supplier_inv_no, grn_no: b.goods_receipts?.no ?? null, po_no: b.purchase_orders?.no ?? null,
      invoice_date: b.invoice_date, due_date: b.due_date,
      gross_amt: Number(b.gross_amt), ewt_amt: Number(b.ewt_amt), net_payable: Number(b.net_payable),
      status: b.status,
    })));

    // Posted GRNs that don't yet have a bill.
    const billedGrnIds = new Set((billedRes.data ?? []).map((r: any) => r.grn_id).filter(Boolean));
    const { data: grnData, error: grnErr } = await supabase.from('goods_receipts')
      .select('id, no, date, po_id, purchase_orders(supplier_id, ewt_amount, suppliers(name))')
      .eq('status', 'posted')
      .order('created_at', { ascending: false });
    if (grnErr) { this.error.set(grnErr.message); this.loading.set(false); return; }

    this.billableGRNs.set((grnData ?? [])
      .filter((g: any) => g.po_id && !billedGrnIds.has(g.id))
      .map((g: any) => ({
        grn_id: g.id, grn_no: g.no, date: g.date, po_id: g.po_id,
        supplier_id: g.purchase_orders?.supplier_id ?? null,
        supplier_name: g.purchase_orders?.suppliers?.name ?? null,
        ewt_amount: Number(g.purchase_orders?.ewt_amount ?? 0),
      })));

    this.loading.set(false);
  }

  async openBill(g: BillableGRN) {
    this.billForm = EMPTY_BILL_FORM();
    this.billForm.grn_id = g.grn_id;
    this.billForm.grn_no = g.grn_no;
    this.billForm.po_id = g.po_id;
    this.billForm.supplier_id = g.supplier_id;
    this.billForm.supplier_name = g.supplier_name;
    this.billForm.ewt_amt = g.ewt_amount;
    this.billError.set(null);

    // Prefill lines from GRN: qty_received × the linked PO line's unit_price.
    const { data, error } = await supabase.from('grn_lines')
      .select('id, line_no, description, qty_received, po_lines(unit_price)')
      .eq('grn_id', g.grn_id)
      .order('line_no');
    if (error) { this.billError.set(error.message); this.showBill.set(true); return; }

    this.billForm.lines = (data ?? []).map((l: any, i: number) => {
      const qty = Number(l.qty_received);
      const price = Number(l.po_lines?.unit_price ?? 0);
      return {
        grn_line_id: l.id,
        description: l.description,
        qty,
        unit_price: price,
        amount: qty * price,
        line_no: i + 1,
      };
    });
    this.showBill.set(true);
    // billForm is a plain [(ngModel)] object, not a signal; in this zoneless app
    // nothing schedules CD after the await, so the loaded lines/totals would not
    // render until an unrelated field is touched. Force a tick.
    this.cdr.markForCheck();
  }

  closeBill() { this.showBill.set(false); }

  async saveBill() {
    this.savingBill.set(true);
    this.billError.set(null);

    if (this.billForm.lines.length === 0) { this.billError.set('No lines to bill.'); this.savingBill.set(false); return; }

    const gross = this.grossAmt();
    const ewt = Number(this.billForm.ewt_amt || 0);
    const net = gross - ewt;

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'BILL' });
    if (noErr || !noData) { this.billError.set(noErr?.message || 'Failed to generate bill number'); this.savingBill.set(false); return; }

    const { data: siRow, error: siErr } = await supabase.from('supplier_invoices').insert({
      no: noData as string,
      supplier_id: this.billForm.supplier_id,
      grn_id: this.billForm.grn_id,
      po_id: this.billForm.po_id,
      supplier_inv_no: this.billForm.supplier_inv_no || null,
      invoice_date: this.billForm.invoice_date,
      due_date: this.billForm.due_date || null,
      gross_amt: gross,
      ewt_amt: ewt,
      net_payable: net,
      status: 'open',
    }).select('id').single();

    if (siErr || !siRow) { this.billError.set(siErr?.message || 'Failed to create bill'); this.savingBill.set(false); return; }

    // Line insert fires the SBILL bridge (posts the JE, bumps ap_balance).
    const linePayloads = this.billForm.lines.map(l => ({
      si_id: siRow.id,
      grn_line_id: l.grn_line_id,
      description: l.description,
      qty: l.qty,
      unit_price: l.unit_price,
      amount: l.amount,
      line_no: l.line_no,
    }));
    const { error: linesErr } = await supabase.from('supplier_invoice_lines').insert(linePayloads);
    if (linesErr) { this.billError.set('Bill saved but lines failed: ' + linesErr.message); this.savingBill.set(false); return; }

    this.savingBill.set(false);
    this.closeBill();
    await this.load();
  }

  statusClass(s: Bill['status']) { return 'bs ' + (s === 'paid' ? 's-ok' : 's-warn'); }
  statusLabel(s: Bill['status']) { return s === 'paid' ? 'Paid' : s === 'partial' ? 'Partial' : 'Open'; }
}
