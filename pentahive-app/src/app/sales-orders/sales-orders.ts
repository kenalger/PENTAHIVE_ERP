import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface SO {
  id: string;
  no: string;
  date: string;
  customer_id: string | null;
  customer_name?: string;
  stream: 'local' | 'import';
  total: number;
  status: 'draft' | 'confirmed' | 'credit_hold' | 'in_transit' | 'delivered' | 'cancelled';
  delivery_date: string | null;
}

interface CustomerLite { id: string; name: string; stream: string; credit_limit: number; ar_balance: number; status: string; }
interface ItemLite { id: string; description: string; uom: string; last_price: number | null; }

interface Line {
  item_id: string;
  product: string;
  grade: string;
  qty_bags: number;
  price_per_bag: number;
}

const EMPTY_LINE = (): Line => ({ item_id: '', product: '', grade: '', qty_bags: 0, price_per_bag: 0 });
const EMPTY_FORM = () => ({
  customer_id: '',
  stream: 'local' as SO['stream'],
  delivery_date: '',
  notes: '',
  lines: [EMPTY_LINE()],
});

@Component({
  selector: 'app-sales-orders',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-g"><span class="kc-ico">💹</span><div class="kc-lbl">Revenue MTD</div><div class="kc-val">{{ peso(kpis().revMtd) }}</div><div class="kc-sub">All streams</div></div>
      <div class="kc kc-b"><span class="kc-ico">🌾</span><div class="kc-lbl">Local MTD</div><div class="kc-val">{{ peso(kpis().localMtd) }}</div><div class="kc-sub">{{ kpis().localCount }} orders</div></div>
      <div class="kc kc-a"><span class="kc-ico">🚢</span><div class="kc-lbl">Import MTD</div><div class="kc-val">{{ peso(kpis().importMtd) }}</div><div class="kc-sub">{{ kpis().importCount }} orders</div></div>
      <div class="kc kc-r"><span class="kc-ico">🚨</span><div class="kc-lbl">Credit Hold</div><div class="kc-val">{{ kpis().held }}</div><div class="kc-sub">Blocked by AR</div></div>
    </div>

    <div class="filter-row">
      <div class="seg">
        <button class="seg-opt" [class.on]="streamFilter() === 'all'"   (click)="streamFilter.set('all')">All</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'local'" (click)="streamFilter.set('local')">🌾 Local</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'import'"(click)="streamFilter.set('import')">🚢 Import</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Sales Order Register</div>
        @if (auth.canDo('sales-orders','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New SO</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (filtered().length === 0) {
        <div class="empty">
          <div class="ico">🧾</div>
          <div class="title">{{ rows().length === 0 ? 'No sales orders yet' : 'No SOs match this filter' }}</div>
          @if (rows().length === 0) { <div class="hint">Click <strong>＋ New SO</strong> to create one.</div> }
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>SO No.</th><th>Date</th><th>Customer</th><th>Stream</th><th class="tr">Total</th><th>Delivery</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (s of filtered(); track s.id) {
                <tr>
                  <td class="mono tb">{{ s.no }}</td>
                  <td class="sub mono">{{ s.date }}</td>
                  <td>{{ s.customer_name || '—' }}</td>
                  <td><span class="pill" [class.local]="s.stream==='local'" [class.import]="s.stream==='import'">{{ s.stream === 'local' ? '🌾 Local' : '🚢 Import' }}</span></td>
                  <td class="mono tr fw6 tg">{{ peso(s.total) }}</td>
                  <td class="sub mono">{{ s.delivery_date || '—' }}</td>
                  <td><span [class]="badgeClass(s.status)">{{ statusLabel(s.status) }}</span></td>
                  <td>
                    @if (canInvoice(s) && auth.canDo('accounts-receivable','create')) {
                      <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="goInvoice()">Create Invoice</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Sales Order'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Customer *</label>
            <select class="ph-select" [(ngModel)]="form.customer_id" name="customer" required (change)="onCustomerChange()">
              <option value="">— Select customer —</option>
              @for (c of customers(); track c.id) {
                <option [value]="c.id">{{ c.name }} {{ c.status === 'credit_hold' ? '· 🔒 HOLD' : '' }}</option>
              }
            </select>
            @if (customer()?.status === 'credit_hold') {
              <div class="ph-alert ph-alert-error" style="margin-top:6px">
                <strong>🔒 Credit hold:</strong> {{ customer()?.name }} has exceeded their credit limit.
                Cannot submit a new SO until cleared. You can save as Draft.
              </div>
            } @else if (customer()) {
              <div class="credit-meter">
                @if (hasCreditLimit()) {
                  <span class="sub">Credit limit: <strong class="mono">{{ peso(customer()!.credit_limit) }}</strong></span>
                  <span class="sub">·</span>
                  <span class="sub">AR balance: <strong class="mono">{{ peso(customer()!.ar_balance) }}</strong></span>
                  <span class="sub">·</span>
                  <span class="sub">Available: <strong class="mono" [class.tg]="creditAvailable() >= 0" [class.cr]="creditAvailable() < 0">{{ peso(creditAvailable()) }}</strong></span>
                } @else {
                  <span class="sub">Credit limit: <strong class="mono tg">No limit set</strong></span>
                  <span class="sub">·</span>
                  <span class="sub">AR balance: <strong class="mono">{{ peso(customer()!.ar_balance) }}</strong></span>
                }
              </div>
            }
          </div>
          <div class="ph-field">
            <label class="ph-label">Stream</label>
            <select class="ph-select" [(ngModel)]="form.stream" name="stream">
              <option value="local">🌾 Local</option>
              <option value="import">🚢 Import</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Delivery Date</label>
            <input class="ph-input" type="date" [(ngModel)]="form.delivery_date" name="delivery" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="form.notes" name="notes" />
          </div>
        </div>

        <div class="lines">
          <div class="lines-h">
            <span>Line items</span><span class="grow"></span>
            <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="addLine()">＋ Add line</button>
          </div>
          <table class="ph-table">
            <thead><tr><th>#</th><th>Item</th><th>Product</th><th>Grade</th><th class="tr">Qty (bags)</th><th class="tr">Price/bag</th><th class="tr">Amount</th><th></th></tr></thead>
            <tbody>
              @for (l of form.lines; track $index) {
                <tr>
                  <td class="mono dim">{{ $index + 1 }}</td>
                  <td>
                    <select class="ph-select" [(ngModel)]="l.item_id" [name]="'item' + $index" (change)="onItemPick(l)" style="min-width:140px">
                      <option value="">— Free text —</option>
                      @for (i of items(); track i.id) { <option [value]="i.id">{{ i.description }}</option> }
                    </select>
                  </td>
                  <td><input class="ph-input" [(ngModel)]="l.product" [name]="'prod' + $index" required /></td>
                  <td><input class="ph-input" [(ngModel)]="l.grade" [name]="'grade' + $index" placeholder="e.g. Premium 5%" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="1" [(ngModel)]="l.qty_bags" [name]="'qty' + $index" style="width:100px" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.price_per_bag" [name]="'price' + $index" style="width:110px" /></td>
                  <td class="mono tr fw6 tg">{{ peso(lineTotal(l)) }}</td>
                  <td>
                    @if (form.lines.length > 1) {
                      <button type="button" class="rm-btn" (click)="removeLine($index)">×</button>
                    }
                  </td>
                </tr>
              }
              <tr class="sum-row">
                <td colspan="6" class="tr sub">Total</td>
                <td class="mono tr fw7 tg">{{ peso(totalAmount()) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="button" class="ph-btn ph-btn-secondary" (click)="save('draft')" [disabled]="saving()">Save Draft</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving() || customer()?.status === 'credit_hold'">
            {{ saving() ? 'Saving…' : 'Confirm SO' }}
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
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .seg { display: inline-flex; background: var(--raised); border: 1px solid var(--rim); border-radius: var(--r8); padding: 3px; gap: 2px; }
    .seg-opt { padding: 6px 14px; border-radius: var(--r6); cursor: pointer; font-size: 12px; color: var(--sub); font-weight: 500; background: transparent; border: none; }
    .seg-opt.on { background: var(--gold); color: var(--gold-text); font-weight: 700; box-shadow: 0 2px 8px rgba(242,168,65,.25); }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .credit-meter { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; font-size: 11px; color: var(--sub); }
    .credit-meter .mono { font-family: var(--mono); color: var(--text); }
    .credit-meter .tg { color: var(--jade); }
    .credit-meter .cr { color: var(--rose); }

    .lines { margin-top: 18px; }
    .lines-h { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; }
    .grow { flex: 1; }
    .lines .ph-input, .lines .ph-select { padding: 6px 8px; font-size: 12px; }
    .sum-row td { background: var(--raised); }
    .rm-btn { background: none; border: none; color: var(--rose); font-size: 20px; cursor: pointer; line-height: 1; padding: 0; width: 24px; height: 24px; }
    .rm-btn:hover { background: var(--rose-bg); border-radius: var(--r4); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: var(--raised); color: var(--sub); }
    .pill.local  { background: var(--local-bg);  color: var(--local-deep); }
    .pill.import { background: var(--import-bg); color: var(--import-deep); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-draft   { background: var(--raised);   color: var(--sub); }
    .s-conf    { background: var(--jade-bg);  color: var(--jade);  border: 1px solid var(--jade-rim); }
    .s-hold    { background: var(--rose-bg);  color: var(--rose);  border: 1px solid var(--rose-rim); }
    .s-transit { background: var(--sky-bg);   color: var(--sky);   border: 1px solid var(--sky-rim); }
    .s-deliv   { background: var(--teal-bg);  color: var(--teal);  border: 1px solid var(--teal-rim); }
    .s-can     { background: var(--raised);   color: var(--sub); }
  `,
})
export class SalesOrders {
  auth = inject(AuthService);
  private router = inject(Router);
  rows = signal<SO[]>([]);
  customers = signal<CustomerLite[]>([]);
  items = signal<ItemLite[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  streamFilter = signal<'all' | 'local' | 'import'>('all');

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  filtered = computed(() => {
    const f = this.streamFilter();
    return f === 'all' ? this.rows() : this.rows().filter(s => s.stream === f);
  });

  kpis = computed(() => {
    const r = this.rows();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const mtd = r.filter(x => x.date.startsWith(thisMonth));
    const local = mtd.filter(x => x.stream === 'local');
    const imp = mtd.filter(x => x.stream === 'import');
    return {
      revMtd: mtd.reduce((s, x) => s + Number(x.total), 0),
      localMtd: local.reduce((s, x) => s + Number(x.total), 0),
      importMtd: imp.reduce((s, x) => s + Number(x.total), 0),
      localCount: local.length,
      importCount: imp.length,
      held: r.filter(x => x.status === 'credit_hold').length,
    };
  });

  // Methods, not computed(): they read `this.form.customer_id`, a plain
  // [(ngModel)]-bound object field that is NOT a signal. A computed() over a
  // non-reactive source evaluates once and never re-runs, so customer() would
  // stay null after the user picks a customer. Methods re-evaluate every CD pass.
  customer() { return this.customers().find(c => c.id === this.form.customer_id) ?? null; }
  // credit_limit 0/null means "no limit set" → treat as unlimited.
  hasCreditLimit() { const c = this.customer(); return !!c && (Number(c.credit_limit) || 0) > 0; }
  // Raw available (can go negative when already over) so the meter and the confirm
  // check agree. Display colours negatives red in the template.
  creditAvailable() {
    const c = this.customer();
    return c ? Number(c.credit_limit) - Number(c.ar_balance) : 0;
  }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [so, cust, it] = await Promise.all([
      supabase.from('sales_orders')
        .select('id, no, date, customer_id, stream, total, status, delivery_date, customers(name)')
        .order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, stream, credit_limit, ar_balance, status').order('name'),
      supabase.from('items').select('id, description, uom, last_price').order('description'),
    ]);
    this.loading.set(false);
    if (so.error) { this.error.set(so.error.message); return; }
    this.rows.set((so.data ?? []).map((s: any) => ({ ...s, customer_name: s.customers?.name })) as SO[]);
    this.customers.set((cust.data ?? []) as CustomerLite[]);
    this.items.set((it.data ?? []) as ItemLite[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  onCustomerChange() {
    const c = this.customer();
    if (c?.stream === 'local' || c?.stream === 'import') this.form.stream = c.stream as 'local' | 'import';
  }
  onItemPick(l: Line) {
    const it = this.items().find(x => x.id === l.item_id);
    if (it) {
      l.product = it.description;
      if (it.last_price && !l.price_per_bag) l.price_per_bag = Number(it.last_price);
    }
  }

  addLine() { this.form.lines = [...this.form.lines, EMPTY_LINE()]; }
  removeLine(i: number) { this.form.lines = this.form.lines.filter((_, ix) => ix !== i); }
  lineTotal(l: Line) { return (Number(l.qty_bags) || 0) * (Number(l.price_per_bag) || 0); }
  totalAmount() { return this.form.lines.reduce((s, l) => s + this.lineTotal(l), 0); }

  async save(mode: 'draft' | true = true) {
    const c = this.customer();
    if (!c) { this.formError.set('Pick a customer.'); return; }
    const lines = this.form.lines.filter(l => l.product && l.qty_bags > 0);
    if (lines.length === 0) { this.formError.set('Add at least one line.'); return; }
    // A draft can legitimately have no prices yet; only a confirm must be > ₱0.
    if (mode !== 'draft' && this.totalAmount() <= 0) {
      this.formError.set('Order total is ₱0 — set a price on at least one line before confirming.');
      return;
    }

    let status: SO['status'] = mode === 'draft' ? 'draft' : 'confirmed';
    let overLimitMsg: string | null = null;
    if (mode !== 'draft') {
      // credit_limit 0/null means "no limit set" → unlimited, never hold.
      const limit = Number(c.credit_limit) || 0;
      const available = limit - Number(c.ar_balance);
      const total = this.totalAmount();
      if (c.status === 'credit_hold' || (limit > 0 && total > available)) {
        status = 'credit_hold';
        if (limit > 0 && total > available) {
          overLimitMsg = `Over credit limit: ${this.peso(available)} available, order is ${this.peso(total)} — placed on credit hold.`;
        }
      }
    }

    this.saving.set(true);
    this.formError.set(null);

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'SO' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate SO number'); this.saving.set(false); return; }

    const { data: soRow, error: soErr } = await supabase.from('sales_orders').insert({
      no: noData as string,
      customer_id: this.form.customer_id,
      stream: this.form.stream,
      total: this.totalAmount(),
      status,
      delivery_date: this.form.delivery_date || null,
      notes: this.form.notes || null,
    }).select('id').single();

    if (soErr || !soRow) { this.formError.set(soErr?.message || 'Failed to create SO'); this.saving.set(false); return; }

    const linePayloads = lines.map((l, i) => ({
      so_id: soRow.id,
      line_no: i + 1,
      item_id: l.item_id || null,
      product: l.product,
      grade: l.grade || null,
      qty_bags: Number(l.qty_bags),
      price_per_bag: Number(l.price_per_bag) || 0,
    }));
    const { error: linesErr } = await supabase.from('so_lines').insert(linePayloads);
    if (linesErr) { this.formError.set('Header saved but lines failed: ' + linesErr.message); this.saving.set(false); return; }

    this.saving.set(false);
    if (overLimitMsg) {
      // Order was persisted on credit hold; keep the dialog open so the operator
      // sees why it was not confirmed.
      this.formError.set(overLimitMsg);
      await this.load();
      return;
    }
    this.closeCreate();
    await this.load();
  }

  canInvoice(s: SO) { return s.status === 'confirmed' || s.status === 'in_transit' || s.status === 'delivered'; }
  goInvoice() { this.router.navigate(['/milling/accounts-receivable']); }

  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  statusLabel(s: SO['status']) {
    return s === 'draft' ? 'Draft'
         : s === 'confirmed' ? 'Confirmed'
         : s === 'credit_hold' ? '🔒 Credit Hold'
         : s === 'in_transit' ? 'In Transit'
         : s === 'delivered' ? 'Delivered'
         : 'Cancelled';
  }
  badgeClass(s: SO['status']) {
    return 'bs ' + (
      s === 'draft' ? 's-draft' :
      s === 'confirmed' ? 's-conf' :
      s === 'credit_hold' ? 's-hold' :
      s === 'in_transit' ? 's-transit' :
      s === 'delivered' ? 's-deliv' :
      's-can'
    );
  }
}
