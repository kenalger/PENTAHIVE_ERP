import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface PO {
  id: string;
  no: string;
  date: string;
  supplier_id: string | null;
  supplier_name?: string;
  category: string | null;
  stream: 'local' | 'import';
  total: number;
  expected_date: string | null;
  status: 'pending_approval' | 'approved' | 'in_transit' | 'boc_clearance' | 'overdue' | 'received' | 'cancelled';
  ewt_rate: number;
  ewt_amount: number;
  bir_registered: boolean;
}

interface SupplierLite { id: string; name: string; bir_registered: boolean; ewt_rate: number; category: string; origin: string | null; }
interface ItemLite { id: string; description: string; uom: string; last_price: number | null; }

interface Line {
  item_id: string;
  description: string;
  uom: string;
  qty: number;
  unit_price: number;
}

const EMPTY_LINE = (): Line => ({ item_id: '', description: '', uom: 'MT', qty: 0, unit_price: 0 });
const EMPTY_FORM = () => ({
  supplier_id: '',
  stream: 'local' as PO['stream'],
  expected_date: '',
  notes: '',
  lines: [EMPTY_LINE()],
});

@Component({
  selector: 'app-purchase-orders',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k3">
      <div class="kc kc-a"><span class="kc-ico">📋</span><div class="kc-lbl">Open POs</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">{{ peso(kpis().openValue) }} total</div></div>
      <div class="kc kc-g"><span class="kc-ico">✅</span><div class="kc-lbl">Received MTD</div><div class="kc-val">{{ kpis().received }}</div><div class="kc-sub">Completed this month</div></div>
      <div class="kc kc-r"><span class="kc-ico">⏰</span><div class="kc-lbl">Overdue</div><div class="kc-val">{{ kpis().overdue }}</div><div class="kc-sub">Past expected date</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Purchase Order Register</div>
        @if (auth.canDo('purchase-orders','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New PO</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">📦</div>
          <div class="title">No purchase orders yet</div>
          <div class="hint">Click <strong>＋ New PO</strong> to draft one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>PO No.</th><th>Date</th><th>Supplier</th><th>BIR</th><th class="tr">Total</th><th>Expected</th><th>EWT</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (p of rows(); track p.id) {
                <tr>
                  <td class="mono ta">{{ p.no }}</td>
                  <td class="sub mono">{{ p.date }}</td>
                  <td>{{ p.supplier_name || '—' }}</td>
                  <td>
                    @if (p.bir_registered) { <span class="bs s-ok" style="font-size:10px">✔ BIR</span> }
                    @else { <span class="bs s-err" style="font-size:10px">✘ No BIR</span> }
                  </td>
                  <td class="mono tr fw6">{{ peso(p.total) }}</td>
                  <td class="sub mono">{{ p.expected_date || '—' }}</td>
                  <td class="mono" [class.tr2]="p.ewt_amount > 0" [class.dim]="p.ewt_amount === 0">
                    {{ p.ewt_amount > 0 ? (p.ewt_rate + '% = ' + peso(p.ewt_amount)) : '—' }}
                  </td>
                  <td><span [class]="badgeClass(p.status)">{{ statusLabel(p.status) }}</span></td>
                  <td>
                    @if (canTransition(p) && auth.canDo('purchase-orders','approve')) {
                      <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="approve(p, $event)">Approve</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (kpis().ewtRemit > 0) {
        <div class="ph-alert ph-alert-warn" style="margin-top:14px">
          ⚠️ <strong>EWT Compliance:</strong> {{ kpis().ewtPos }} active PO(s) from non-BIR suppliers.
          Total EWT to remit: <strong>{{ peso(kpis().ewtRemit) }}</strong>.
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Purchase Order'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Supplier *</label>
            <select class="ph-select" [(ngModel)]="form.supplier_id" name="supplier" required>
              <option value="">— Select supplier —</option>
              @for (s of suppliers(); track s.id) {
                <option [value]="s.id">{{ s.name }} {{ s.bir_registered ? '· BIR' : '· No BIR' }}</option>
              }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Expected Date</label>
            <input class="ph-input" type="date" [(ngModel)]="form.expected_date" name="expected" />
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
            <thead><tr><th>#</th><th>Item</th><th>Description</th><th>UoM</th><th class="tr">Qty</th><th class="tr">Unit ₱</th><th class="tr">Total</th><th></th></tr></thead>
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
                  <td><input class="ph-input" [(ngModel)]="l.description" [name]="'desc' + $index" required /></td>
                  <td><input class="ph-input mono" [(ngModel)]="l.uom" [name]="'uom' + $index" style="width:70px" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.qty" [name]="'qty' + $index" style="width:90px" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.unit_price" [name]="'price' + $index" style="width:110px" /></td>
                  <td class="mono tr fw6">{{ peso(lineTotal(l)) }}</td>
                  <td>
                    @if (form.lines.length > 1) {
                      <button type="button" class="rm-btn" (click)="removeLine($index)">×</button>
                    }
                  </td>
                </tr>
              }
              <tr class="sum-row">
                <td colspan="6" class="tr sub">Subtotal</td>
                <td class="mono tr fw7 tg">{{ peso(totalAmount()) }}</td>
                <td></td>
              </tr>
              @if (ewtAmount() > 0) {
                <tr class="sum-row">
                  <td colspan="6" class="tr sub">EWT ({{ supplierEwtRate() }}%)</td>
                  <td class="mono tr fw6 tr2">-{{ peso(ewtAmount()) }}</td>
                  <td></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create PO' }}
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

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }

    .lines { margin-top: 18px; }
    .lines-h { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; }
    .grow { flex: 1; }
    .lines .ph-input, .lines .ph-select { padding: 6px 8px; font-size: 12px; }
    .sum-row td { background: var(--raised); }
    .rm-btn { background: none; border: none; color: var(--rose); font-size: 20px; cursor: pointer; line-height: 1; padding: 0; width: 24px; height: 24px; }
    .rm-btn:hover { background: var(--rose-bg); border-radius: var(--r4); }

    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-err { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
    .s-pending { background: var(--gold-bg);  color: var(--gold);  border: 1px solid var(--gold-rim); }
    .s-app     { background: var(--jade-bg);  color: var(--jade);  border: 1px solid var(--jade-rim); }
    .s-transit { background: var(--sky-bg);   color: var(--sky);   border: 1px solid var(--sky-rim); }
    .s-boc     { background: var(--violet-bg);color: var(--violet);border: 1px solid var(--violet-rim); }
    .s-over    { background: var(--rose-bg);  color: var(--rose);  border: 1px solid var(--rose-rim); }
    .s-recv    { background: var(--teal-bg);  color: var(--teal);  border: 1px solid var(--teal-rim); }
    .s-can     { background: var(--raised);   color: var(--sub); }
  `,
})
export class PurchaseOrders {
  auth = inject(AuthService);
  rows = signal<PO[]>([]);
  suppliers = signal<SupplierLite[]>([]);
  items = signal<ItemLite[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  kpis = computed(() => {
    const r = this.rows();
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const openStatuses = new Set(['pending_approval', 'approved', 'in_transit', 'boc_clearance']);
    return {
      open: r.filter(x => openStatuses.has(x.status)).length,
      openValue: r.filter(x => openStatuses.has(x.status)).reduce((s, x) => s + Number(x.total), 0),
      received: r.filter(x => x.status === 'received' && x.date.startsWith(thisMonth)).length,
      overdue: r.filter(x => x.expected_date && x.expected_date < today && (x.status === 'pending_approval' || x.status === 'approved' || x.status === 'in_transit')).length,
      ewtPos: r.filter(x => !x.bir_registered && openStatuses.has(x.status)).length,
      ewtRemit: r.filter(x => !x.bir_registered && openStatuses.has(x.status)).reduce((s, x) => s + Number(x.ewt_amount), 0),
    };
  });

  // Methods, not computed(): they read `this.form.supplier_id`, a plain
  // [(ngModel)]-bound object field that is NOT a signal. A computed() over a
  // non-reactive source evaluates once and never re-runs, so supplier() would
  // stay null after the user picks a supplier and save() would TypeError on
  // supplier()!.category. Methods re-evaluate every CD pass.
  supplier() { return this.suppliers().find(s => s.id === this.form.supplier_id) ?? null; }
  supplierEwtRate() {
    const s = this.supplier();
    return s && !s.bir_registered ? Number(s.ewt_rate) || 1 : 0;
  }
  ewtAmount() { return this.totalAmount() * (this.supplierEwtRate() / 100); }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [po, sup, it] = await Promise.all([
      supabase.from('milling_purchase_orders')
        .select('id, no, date, supplier_id, category, stream, total, expected_date, status, ewt_rate, ewt_amount, bir_registered, milling_suppliers(name)')
        .order('created_at', { ascending: false }),
      supabase.from('milling_suppliers')
        .select('id, name, bir_registered, ewt_rate, category, origin')
        .eq('status', 'active')
        .order('name'),
      supabase.from('milling_items')
        .select('id, description, uom, last_price')
        .order('description'),
    ]);
    this.loading.set(false);
    if (po.error) { this.error.set(po.error.message); return; }
    this.rows.set((po.data ?? []).map((p: any) => ({ ...p, supplier_name: p.suppliers?.name })) as PO[]);
    this.suppliers.set((sup.data ?? []) as SupplierLite[]);
    this.items.set((it.data ?? []) as ItemLite[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  onItemPick(l: Line) {
    const it = this.items().find(x => x.id === l.item_id);
    if (it) {
      l.description = it.description;
      l.uom = it.uom;
      if (it.last_price && !l.unit_price) l.unit_price = Number(it.last_price);
    }
  }

  addLine() { this.form.lines = [...this.form.lines, EMPTY_LINE()]; }
  removeLine(i: number) { this.form.lines = this.form.lines.filter((_, ix) => ix !== i); }
  lineTotal(l: Line) { return (Number(l.qty) || 0) * (Number(l.unit_price) || 0); }
  totalAmount() { return this.form.lines.reduce((s, l) => s + this.lineTotal(l), 0); }

  async save() {
    this.saving.set(true);
    this.formError.set(null);

    if (!this.form.supplier_id) { this.formError.set('Pick a supplier.'); this.saving.set(false); return; }
    const lines = this.form.lines.filter(l => l.description && l.qty > 0);
    if (lines.length === 0) { this.formError.set('Add at least one line.'); this.saving.set(false); return; }

    const sup = this.supplier();
    if (!sup) { this.formError.set('Pick a supplier.'); this.saving.set(false); return; }
    const total = this.totalAmount();
    if (total <= 0) { this.formError.set('PO total is ₱0 — set a unit price on at least one line.'); this.saving.set(false); return; }
    const ewtRate = this.supplierEwtRate();
    const ewtAmount = total * (ewtRate / 100);

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'PO' });
    if (noErr || !noData) {
      this.formError.set(noErr?.message || 'Failed to generate PO number');
      this.saving.set(false);
      return;
    }

    const { data: poRow, error: poErr } = await supabase.from('milling_purchase_orders').insert({
      no: noData as string,
      supplier_id: this.form.supplier_id,
      stream: this.form.stream,
      category: sup.category,
      total,
      expected_date: this.form.expected_date || null,
      ewt_rate: ewtRate,
      ewt_amount: ewtAmount,
      bir_registered: sup.bir_registered,
      notes: this.form.notes || null,
    }).select('id').single();

    if (poErr || !poRow) {
      this.formError.set(poErr?.message || 'Failed to create PO');
      this.saving.set(false);
      return;
    }

    const linePayloads = lines.map((l, i) => ({
      po_id: poRow.id,
      line_no: i + 1,
      item_id: l.item_id || null,
      description: l.description,
      uom: l.uom,
      qty: Number(l.qty),
      unit_price: Number(l.unit_price) || 0,
    }));
    const { error: linesErr } = await supabase.from('milling_po_lines').insert(linePayloads);
    if (linesErr) { this.formError.set('Header saved but lines failed: ' + linesErr.message); this.saving.set(false); return; }

    this.saving.set(false);
    this.closeCreate();
    await this.load();
  }

  canTransition(p: PO) {
    return p.status === 'pending_approval';
  }
  async approve(p: PO, e: Event) {
    e.stopPropagation();
    const { error } = await supabase.from('milling_purchase_orders').update({ status: 'approved' }).eq('id', p.id);
    if (error) { alert(error.message); return; }
    await this.load();
  }

  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  statusLabel(s: PO['status']) {
    return s === 'pending_approval' ? 'Pending Approval'
         : s === 'approved' ? 'Approved'
         : s === 'in_transit' ? 'In Transit'
         : s === 'boc_clearance' ? 'BOC Clearance'
         : s === 'overdue' ? 'Overdue'
         : s === 'received' ? 'Received'
         : 'Cancelled';
  }
  badgeClass(s: PO['status']) {
    return 'bs ' + (
      s === 'pending_approval' ? 's-pending' :
      s === 'approved' ? 's-app' :
      s === 'in_transit' ? 's-transit' :
      s === 'boc_clearance' ? 's-boc' :
      s === 'overdue' ? 's-over' :
      s === 'received' ? 's-recv' :
      's-can'
    );
  }
}
