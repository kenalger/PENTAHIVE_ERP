import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface GRN {
  id: string;
  no: string;
  date: string;
  po_no: string | null;
  supplier_name: string | null;
  qc_result: 'passed' | 'partial_reject' | 'rejected';
  warehouse_id: string | null;
  status: 'posted' | 'dispute';
}

interface POOption {
  id: string;
  no: string;
  supplier_name: string;
  status: string;
}

interface POLine {
  id: string;
  line_no: number;
  description: string;
  uom: string;
  qty: number;
}

interface WHOption { id: string; name: string; }

interface RcvLine extends POLine {
  qty_received: number;
}

const EMPTY_FORM = () => ({
  po_id: '',
  po_no: null as string | null,
  supplier_name: null as string | null,
  qc_result: 'passed' as GRN['qc_result'],
  warehouse_id: '',
  status: 'posted' as GRN['status'],
  notes: '',
  lines: [] as RcvLine[],
});

@Component({
  selector: 'app-goods-receipts',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-g"><span class="kc-ico">📦</span><div class="kc-lbl">GRNs MTD</div><div class="kc-val">{{ kpis().mtd }}</div><div class="kc-sub">Posted this month</div></div>
      <div class="kc kc-a"><span class="kc-ico">✅</span><div class="kc-lbl">Posted</div><div class="kc-val">{{ kpis().posted }}</div><div class="kc-sub">All-time clean receipts</div></div>
      <div class="kc kc-r"><span class="kc-ico">🚫</span><div class="kc-lbl">Disputes</div><div class="kc-val">{{ kpis().disputes }}</div><div class="kc-sub">Partial / rejected</div></div>
      <div class="kc kc-b"><span class="kc-ico">🔬</span><div class="kc-lbl">QC Pass Rate</div><div class="kc-val">{{ kpis().passRate }}%</div><div class="kc-sub">All GRNs · {{ kpis().total }} total</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Goods Receipt Register</div>
        @if (auth.canDo('goods-receipts','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New GRN</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">📥</div>
          <div class="title">No goods receipts yet</div>
          <div class="hint">Mark a PO as received to post a GRN.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>GRN No.</th><th>Date</th><th>PO Ref</th><th>Supplier</th><th>QC Result</th><th>Status</th></tr></thead>
            <tbody>
              @for (g of rows(); track g.id) {
                <tr>
                  <td class="mono ta">{{ g.no }}</td>
                  <td class="sub mono">{{ g.date }}</td>
                  <td class="mono tb">{{ g.po_no || '—' }}</td>
                  <td>{{ g.supplier_name || '—' }}</td>
                  <td><span [class]="qcClass(g.qc_result)">{{ qcLabel(g.qc_result) }}</span></td>
                  <td><span [class]="statusClass(g.status)">{{ g.status === 'posted' ? 'Posted' : 'Dispute' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Goods Receipt'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Source PO *</label>
            <select class="ph-select" [(ngModel)]="form.po_id" name="po" required (change)="onPOChange()">
              <option value="">— Select PO —</option>
              @for (p of poOptions(); track p.id) {
                <option [value]="p.id">{{ p.no }} · {{ p.supplier_name }}</option>
              }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Warehouse</label>
            <select class="ph-select" [(ngModel)]="form.warehouse_id" name="warehouse">
              <option value="">— Not assigned —</option>
              @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">QC Result</label>
            <select class="ph-select" [(ngModel)]="form.qc_result" name="qc">
              <option value="passed">Passed</option>
              <option value="partial_reject">Partial Reject</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Status</label>
            <select class="ph-select" [(ngModel)]="form.status" name="status">
              <option value="posted">Posted</option>
              <option value="dispute">Dispute</option>
            </select>
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="form.notes" name="notes" />
          </div>
        </div>

        @if (form.lines.length > 0) {
          <div class="lines">
            <div class="lines-h"><span>Receipt lines (qty per PO line)</span></div>
            <table class="ph-table">
              <thead><tr><th>#</th><th>Description</th><th>UoM</th><th class="tr">PO Qty</th><th class="tr">Received</th><th class="tr">Variance</th></tr></thead>
              <tbody>
                @for (l of form.lines; track l.id) {
                  <tr>
                    <td class="mono dim">{{ l.line_no }}</td>
                    <td>{{ l.description }}</td>
                    <td class="mono">{{ l.uom }}</td>
                    <td class="mono tr sub">{{ l.qty }}</td>
                    <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.qty_received" [name]="'rcv' + l.id" style="width:110px" /></td>
                    <td class="mono tr" [class.tg]="variance(l) === 0" [class.tr2]="variance(l) < 0" [class.ta]="variance(l) > 0">
                      {{ variance(l).toFixed(2) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (form.po_id) {
          <p class="sub" style="margin-top:12px">No lines on that PO.</p>
        }

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving() || !form.po_id">
            {{ saving() ? 'Saving…' : 'Post GRN' }}
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
    .form-grid .col-3 { grid-column: span 3; }
    .lines { margin-top: 18px; }
    .lines-h { font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
    .lines .ph-input { padding: 6px 10px; font-size: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-err { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class GoodsReceipts {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  rows = signal<GRN[]>([]);
  poOptions = signal<POOption[]>([]);
  warehouses = signal<WHOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  kpis = computed(() => {
    const r = this.rows();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const total = r.length;
    const passed = r.filter(x => x.qc_result === 'passed').length;
    return {
      total,
      posted: r.filter(x => x.status === 'posted').length,
      disputes: r.filter(x => x.status === 'dispute' || x.qc_result === 'rejected' || x.qc_result === 'partial_reject').length,
      mtd: r.filter(x => x.date.startsWith(thisMonth)).length,
      passRate: total ? Math.round((passed / total) * 100) : 100,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [grn, pos, wh] = await Promise.all([
      supabase.from('milling_goods_receipts')
        .select('id, no, date, po_no, supplier_name, qc_result, warehouse_id, status')
        .order('created_at', { ascending: false }),
      supabase.from('milling_purchase_orders')
        .select('id, no, status, milling_suppliers(name)')
        .in('status', ['approved', 'in_transit', 'boc_clearance']),
      supabase.from('milling_warehouses').select('id, name').eq('status', 'active').order('name'),
    ]);
    this.loading.set(false);
    if (grn.error) { this.error.set(grn.error.message); return; }
    this.rows.set((grn.data ?? []) as GRN[]);
    this.poOptions.set((pos.data ?? []).map((p: any) => ({ id: p.id, no: p.no, status: p.status, supplier_name: p.suppliers?.name ?? '—' })));
    this.warehouses.set((wh.data ?? []) as WHOption[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  async onPOChange() {
    const po = this.poOptions().find(p => p.id === this.form.po_id);
    this.form.po_no = po?.no ?? null;
    this.form.supplier_name = po?.supplier_name ?? null;
    if (!po) { this.form.lines = []; return; }
    const { data, error } = await supabase
      .from('milling_po_lines')
      .select('id, line_no, description, uom, qty')
      .eq('po_id', po.id)
      .order('line_no');
    if (error) { this.formError.set(error.message); return; }
    this.form.lines = (data ?? []).map((l: any) => ({ ...l, qty_received: Number(l.qty) }));
    // form is a plain [(ngModel)] object, not a signal; in this zoneless app nothing
    // schedules CD after the await, so the qty rows would not render until an unrelated
    // field is touched. Force a tick.
    this.cdr.markForCheck();
  }

  variance(l: RcvLine) { return (Number(l.qty_received) || 0) - Number(l.qty); }

  async save() {
    this.saving.set(true);
    this.formError.set(null);

    if (!this.form.po_id) { this.formError.set('Pick a PO.'); this.saving.set(false); return; }

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'GRN' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate GRN number'); this.saving.set(false); return; }

    const { data: grnRow, error: grnErr } = await supabase.from('milling_goods_receipts').insert({
      no: noData as string,
      po_id: this.form.po_id,
      po_no: this.form.po_no,
      supplier_name: this.form.supplier_name,
      qc_result: this.form.qc_result,
      warehouse_id: this.form.warehouse_id || null,
      status: this.form.status,
      notes: this.form.notes || null,
    }).select('id').single();

    if (grnErr || !grnRow) { this.formError.set(grnErr?.message || 'Failed to create GRN'); this.saving.set(false); return; }

    if (this.form.lines.length > 0) {
      const linePayloads = this.form.lines.map(l => ({
        grn_id: grnRow.id,
        po_line_id: l.id,
        line_no: l.line_no,
        description: l.description,
        uom: l.uom,
        qty_po: Number(l.qty),
        qty_received: Number(l.qty_received) || 0,
      }));
      const { error: linesErr } = await supabase.from('milling_grn_lines').insert(linePayloads);
      if (linesErr) { this.formError.set('Header saved but lines failed: ' + linesErr.message); this.saving.set(false); return; }
    }

    // If posted, flip the PO to 'received'
    if (this.form.status === 'posted') {
      await supabase.from('milling_purchase_orders').update({ status: 'received' }).eq('id', this.form.po_id);
    }

    this.saving.set(false);
    this.closeCreate();
    await this.load();
  }

  qcLabel(q: GRN['qc_result']) { return q === 'passed' ? 'Passed' : q === 'partial_reject' ? 'Partial Reject' : 'Rejected'; }
  qcClass(q: GRN['qc_result']) { return 'bs ' + (q === 'passed' ? 's-ok' : q === 'partial_reject' ? 's-warn' : 's-err'); }
  statusClass(s: GRN['status']) { return 'bs ' + (s === 'posted' ? 's-ok' : 's-warn'); }
}
