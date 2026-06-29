import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Inv {
  id: string;
  sku: string;
  product: string;
  variety_grade: string | null;
  warehouse_id: string | null;
  warehouse_name?: string;
  warehouse_capacity?: number;
  stream: 'local' | 'import';
  on_hand_mt: number;
  reserved_mt: number;
  available_mt: number;
  unit_cost: number;
  total_value: number;
  reorder_pt: number;
}

interface WHOption { id: string; name: string; capacity_mt: number | null; }

interface InvStatus { label: string; cls: string; }

const EMPTY_FORM = () => ({
  sku: '', product: '', variety_grade: '',
  warehouse_id: '',
  stream: 'local' as Inv['stream'],
  on_hand_mt: 0,
  reserved_mt: 0,
  unit_cost: 0,
  reorder_pt: 0,
});

const EMPTY_ADJUST = () => ({
  sku: '',
  type: 'adjust' as 'receipt' | 'dispatch' | 'adjust',
  qty: 0,
  notes: '',
});

@Component({
  selector: 'app-inventory',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-b"><span class="kc-ico">🏪</span><div class="kc-lbl">Total Value</div><div class="kc-val">{{ peso(kpis().totalValue) }}</div><div class="kc-sub">{{ kpis().lineCount }} SKUs</div></div>
      <div class="kc kc-g"><span class="kc-ico">🌾</span><div class="kc-lbl">Local Value</div><div class="kc-val">{{ peso(kpis().localValue) }}</div><div class="kc-sub">{{ peso2(kpis().localMt) }} on hand</div></div>
      <div class="kc kc-a"><span class="kc-ico">🚢</span><div class="kc-lbl">Import Value</div><div class="kc-val">{{ peso(kpis().importValue) }}</div><div class="kc-sub">{{ peso2(kpis().importMt) }} on hand</div></div>
      <div class="kc kc-r"><span class="kc-ico">⚠️</span><div class="kc-lbl">Low / Critical</div><div class="kc-val">{{ kpis().lowCount }}</div><div class="kc-sub">Below reorder point</div></div>
    </div>

    <!-- Warehouse utilization -->
    @if (warehouseStats().length > 0) {
      <div class="card mb">
        <div class="card-h"><div class="card-t">Warehouse Utilization</div></div>
        <div class="util-list">
          @for (w of warehouseStats(); track w.id) {
            <div class="hpb-row">
              <div class="hpb-name">{{ w.name }}</div>
              <div class="hpb-track">
                <div class="hpb-fill"
                     [style.width.%]="w.pct"
                     [style.background]="utilColor(w.pct)"></div>
              </div>
              <div class="hpb-pct" [class.dim]="!w.capacity">
                {{ w.capacity ? (w.pct + '%') : '—' }}
              </div>
              <div class="hpb-text">{{ peso2(w.on_hand) }} / {{ w.capacity ? peso2(w.capacity) : '—' }}</div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Stream filter -->
    <div class="filter-row">
      <div class="seg">
        <button class="seg-opt" [class.on]="streamFilter() === 'all'"    (click)="streamFilter.set('all')">All</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'local'"  (click)="streamFilter.set('local')">🌾 Local</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'import'" (click)="streamFilter.set('import')">🚢 Import</button>
      </div>
      <span class="grow"></span>
      @if (auth.canDo('inventory','create')) {
        <button class="ph-btn ph-btn-secondary ph-btn-sm" (click)="openCreate()">＋ New SKU</button>
      }
    </div>

    @for (s of streamsToRender(); track s) {
      <div class="stream-card" [class.local]="s==='local'" [class.import]="s==='import'">
        <div class="card-h">
          <div class="card-t">
            {{ s === 'local' ? '🌾 Local Stock' : '🚢 Import Stock' }}
          </div>
          <span class="chip">{{ rowsByStream(s).length }} SKU(s)</span>
        </div>

        @if (rowsByStream(s).length === 0) {
          <div class="empty">
            <div class="ico">{{ s === 'local' ? '🌾' : '🚢' }}</div>
            <div class="title">No {{ s }} stock yet</div>
            <div class="hint">Click <strong>＋ New SKU</strong> above to register {{ s }} inventory.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead>
                <tr>
                  <th>SKU</th><th>Product</th><th>Grade</th><th>Warehouse</th>
                  <th class="tr">On Hand (MT)</th><th class="tr">Reserved</th><th class="tr">Available</th>
                  <th class="tr">Unit ₱/MT</th><th class="tr">Value</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (i of rowsByStream(s); track i.id) {
                  <tr>
                    <td class="mono ta">{{ i.sku }}</td>
                    <td><b>{{ i.product }}</b></td>
                    <td class="sub">{{ i.variety_grade || '—' }}</td>
                    <td class="sub">{{ i.warehouse_name || '—' }}</td>
                    <td class="mono tr">{{ peso2(i.on_hand_mt) }}</td>
                    <td class="mono tr sub">{{ peso2(i.reserved_mt) }}</td>
                    <td class="mono tr fw6 tg">{{ peso2(i.available_mt) }}</td>
                    <td class="mono tr">{{ peso(i.unit_cost) }}</td>
                    <td class="mono tr fw6">{{ peso(i.total_value) }}</td>
                    <td><span [class]="statusBadge(i).cls">{{ statusBadge(i).label }}</span></td>
                    <td>
                      @if (auth.canDo('inventory','edit')) {
                        <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="openAdjust(i, $event)">Adjust</button>
                      }
                    </td>
                  </tr>
                }
                <tr class="sum-row">
                  <td colspan="4" class="tr sub">Subtotal · {{ s === 'local' ? 'Local' : 'Import' }}</td>
                  <td class="mono tr fw7">{{ peso2(streamSubtotal(s).onHand) }}</td>
                  <td></td>
                  <td class="mono tr fw7 tg">{{ peso2(streamSubtotal(s).available) }}</td>
                  <td></td>
                  <td class="mono tr fw7" [class.tg]="s==='local'" [class.tb]="s==='import'">{{ peso(streamSubtotal(s).value) }}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <app-modal [open]="showCreate()" [title]="'New Inventory SKU'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">SKU *</label>
            <input class="ph-input mono" [(ngModel)]="form.sku" name="sku" required placeholder="e.g. INV-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Product *</label>
            <input class="ph-input" [(ngModel)]="form.product" name="product" required placeholder="e.g. Premium Sinandomeng" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Variety / Grade</label>
            <input class="ph-input" [(ngModel)]="form.variety_grade" name="grade" placeholder="e.g. Premium 5%" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Warehouse</label>
            <select class="ph-select" [(ngModel)]="form.warehouse_id" name="warehouse">
              <option value="">— Unassigned —</option>
              @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Stream</label>
            <select class="ph-select" [(ngModel)]="form.stream" name="stream">
              <option value="local">🌾 Local</option>
              <option value="import">🚢 Import</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">On Hand (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="form.on_hand_mt" name="onhand" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Reserved (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="form.reserved_mt" name="reserved" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Unit Cost (₱/MT)</label>
            <input class="ph-input mono" type="number" min="0" step="1" [(ngModel)]="form.unit_cost" name="cost" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Reorder Point (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="form.reorder_pt" name="reorder" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create SKU' }}
          </button>
        </div>
      </form>
    </app-modal>

    <app-modal [open]="showAdjust()" [title]="'Stock Adjustment — ' + adjust.sku" (closed)="closeAdjust()">
      <form (ngSubmit)="saveAdjust()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Type *</label>
            <select class="ph-select" [(ngModel)]="adjust.type" name="type" required>
              <option value="receipt">Receipt (+)</option>
              <option value="dispatch">Dispatch (−)</option>
              <option value="adjust">Manual Adjust (signed)</option>
            </select>
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Quantity (MT) *</label>
            <input class="ph-input mono" type="number" step="0.01" [(ngModel)]="adjust.qty" name="qty" required />
            <span class="help">Receipt/Dispatch must be positive. Adjust can be positive or negative.</span>
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="adjust.notes" name="notes" placeholder="Reason / reference" />
          </div>
        </div>

        @if (adjustError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ adjustError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeAdjust()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="adjusting()">
            {{ adjusting() ? 'Saving…' : 'Post adjustment' }}
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
    .grow { flex: 1; }
    .seg { display: inline-flex; background: var(--raised); border: 1px solid var(--rim); border-radius: var(--r8); padding: 3px; gap: 2px; }
    .seg-opt { padding: 6px 14px; border-radius: var(--r6); cursor: pointer; font-size: 12px; color: var(--sub); font-weight: 500; background: transparent; border: none; }
    .seg-opt.on { background: var(--gold); color: var(--gold-text); font-weight: 700; box-shadow: 0 2px 8px rgba(242,168,65,.25); }

    .stream-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 22px; margin-bottom: 18px; border-left-width: 4px; }
    .stream-card.local  { border-left-color: var(--local); }
    .stream-card.import { border-left-color: var(--import); }
    .card-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .card-t { font-size: 12px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; }
    .chip { font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: var(--r4); background: var(--raised); color: var(--sub); border: 1px solid var(--border); }

    .stream-card.local .sum-row td  { background: var(--local-bg); }
    .stream-card.import .sum-row td { background: var(--import-bg); }

    .util-list { display: flex; flex-direction: column; gap: 8px; }
    .hpb-row { display: flex; align-items: center; gap: 10px; }
    .hpb-name { width: 200px; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hpb-track { flex: 1; height: 8px; background: var(--raised); border-radius: 4px; overflow: hidden; }
    .hpb-fill { height: 100%; border-radius: 4px; transition: width .8s; }
    .hpb-pct { width: 50px; font-size: 11px; font-family: var(--mono); color: var(--sub); text-align: right; }
    .hpb-pct.dim { color: var(--dim); }
    .hpb-text { width: 160px; font-size: 11px; font-family: var(--mono); color: var(--sub); text-align: right; }

    .empty { text-align: center; padding: 28px 18px; color: var(--sub); }
    .empty .ico { font-size: 32px; margin-bottom: 6px; opacity: 0.6; }
    .empty .title { font-size: 14px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 11.5px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-grid .col-3 { grid-column: span 3; }
    .help { font-size: 10.5px; color: var(--dim); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok       { background: var(--jade-bg);  color: var(--jade);  border: 1px solid var(--jade-rim); }
    .s-low      { background: var(--gold-bg);  color: var(--gold);  border: 1px solid var(--gold-rim); }
    .s-critical { background: var(--rose-bg);  color: var(--rose);  border: 1px solid var(--rose-rim); }
  `,
})
export class Inventory {
  auth = inject(AuthService);
  rows = signal<Inv[]>([]);
  warehouses = signal<WHOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  streamFilter = signal<'all' | 'local' | 'import'>('all');

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  showAdjust = signal(false);
  adjusting = signal(false);
  adjustError = signal<string | null>(null);
  adjust = EMPTY_ADJUST();
  adjustTargetId = '';

  kpis = computed(() => {
    const r = this.rows();
    return {
      lineCount: r.length,
      totalValue: r.reduce((s, x) => s + Number(x.total_value), 0),
      localValue: r.filter(x => x.stream === 'local').reduce((s, x) => s + Number(x.total_value), 0),
      importValue: r.filter(x => x.stream === 'import').reduce((s, x) => s + Number(x.total_value), 0),
      localMt: r.filter(x => x.stream === 'local').reduce((s, x) => s + Number(x.on_hand_mt), 0),
      importMt: r.filter(x => x.stream === 'import').reduce((s, x) => s + Number(x.on_hand_mt), 0),
      lowCount: r.filter(x => Number(x.on_hand_mt) <= Number(x.reorder_pt)).length,
    };
  });

  warehouseStats = computed(() => {
    const wh = this.warehouses();
    const r = this.rows();
    return wh.map(w => {
      const on_hand = r.filter(x => x.warehouse_id === w.id).reduce((s, x) => s + Number(x.on_hand_mt), 0);
      const capacity = Number(w.capacity_mt) || 0;
      const pct = capacity ? Math.min(100, Math.round((on_hand / capacity) * 100)) : 0;
      return { id: w.id, name: w.name, on_hand, capacity, pct };
    }).filter(w => w.on_hand > 0 || w.capacity > 0);
  });

  streamsToRender = computed<('local' | 'import')[]>(() => {
    const f = this.streamFilter();
    if (f === 'local')  return ['local'];
    if (f === 'import') return ['import'];
    return ['local', 'import'];
  });

  rowsByStream(s: 'local' | 'import') { return this.rows().filter(r => r.stream === s); }

  streamSubtotal(s: 'local' | 'import') {
    const r = this.rowsByStream(s);
    return {
      onHand: r.reduce((acc, x) => acc + Number(x.on_hand_mt), 0),
      available: r.reduce((acc, x) => acc + Number(x.available_mt), 0),
      value: r.reduce((acc, x) => acc + Number(x.total_value), 0),
    };
  }

  statusBadge(i: Inv): InvStatus {
    const onHand = Number(i.on_hand_mt);
    const reorder = Number(i.reorder_pt);
    if (onHand <= 0) return { label: 'Out of stock', cls: 'bs s-critical' };
    if (reorder > 0 && onHand <= reorder * 0.5) return { label: 'Critical', cls: 'bs s-critical' };
    if (reorder > 0 && onHand <= reorder)        return { label: 'Low', cls: 'bs s-low' };
    return { label: 'OK', cls: 'bs s-ok' };
  }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [inv, wh] = await Promise.all([
      supabase.from('milling_inventory')
        .select('id, sku, product, variety_grade, warehouse_id, stream, on_hand_mt, reserved_mt, available_mt, unit_cost, total_value, reorder_pt, milling_warehouses(name, capacity_mt)')
        .order('product'),
      supabase.from('milling_warehouses').select('id, name, capacity_mt').eq('status', 'active').order('name'),
    ]);
    this.loading.set(false);
    if (inv.error) { this.error.set(inv.error.message); return; }
    this.rows.set((inv.data ?? []).map((r: any) => ({
      ...r,
      warehouse_name: r.warehouses?.name,
      warehouse_capacity: r.warehouses?.capacity_mt,
    })) as Inv[]);
    this.warehouses.set((wh.data ?? []) as WHOption[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const payload = {
      sku: this.form.sku,
      product: this.form.product,
      variety_grade: this.form.variety_grade || null,
      warehouse_id: this.form.warehouse_id || null,
      stream: this.form.stream,
      on_hand_mt: Number(this.form.on_hand_mt) || 0,
      reserved_mt: Number(this.form.reserved_mt) || 0,
      unit_cost: Number(this.form.unit_cost) || 0,
      reorder_pt: Number(this.form.reorder_pt) || 0,
    };
    const { error } = await supabase.from('milling_inventory').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  openAdjust(i: Inv, e: Event) {
    e.stopPropagation();
    this.adjust = { ...EMPTY_ADJUST(), sku: i.sku };
    this.adjustTargetId = i.id;
    this.adjustError.set(null);
    this.showAdjust.set(true);
  }
  closeAdjust() { this.showAdjust.set(false); }

  async saveAdjust() {
    this.adjusting.set(true);
    this.adjustError.set(null);
    const qty = Number(this.adjust.qty);
    if (!qty) { this.adjustError.set('Qty must be non-zero.'); this.adjusting.set(false); return; }

    // Determine impact: receipts +qty, dispatch -|qty|, adjust = signed qty
    const impact = this.adjust.type === 'dispatch' ? -Math.abs(qty) :
                   this.adjust.type === 'receipt'  ?  Math.abs(qty) :
                   qty;

    // Get current on_hand
    const target = this.rows().find(r => r.id === this.adjustTargetId);
    if (!target) { this.adjustError.set('SKU not found'); this.adjusting.set(false); return; }
    const newOnHand = Number(target.on_hand_mt) + impact;
    if (newOnHand < 0) { this.adjustError.set('This would result in negative on-hand stock.'); this.adjusting.set(false); return; }

    // Update inventory + write transaction (no atomic txn from client; best-effort sequential)
    const { error: updErr } = await supabase
      .from('milling_inventory')
      .update({ on_hand_mt: newOnHand })
      .eq('id', this.adjustTargetId);
    if (updErr) { this.adjustError.set(updErr.message); this.adjusting.set(false); return; }

    const { error: txErr } = await supabase.from('milling_inventory_transactions').insert({
      sku: this.adjust.sku,
      type: this.adjust.type,
      qty: Math.abs(impact),
      notes: this.adjust.notes || null,
    });
    if (txErr) {
      this.adjustError.set('Stock updated but transaction log failed: ' + txErr.message);
      this.adjusting.set(false);
      return;
    }

    this.adjusting.set(false);
    this.closeAdjust();
    await this.load();
  }

  utilColor(pct: number): string {
    if (pct >= 90) return 'var(--rose)';
    if (pct >= 70) return 'var(--gold)';
    return 'var(--jade)';
  }

  peso(n: number)  { return '₱' + Math.round(n).toLocaleString(); }
  peso2(n: number) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' MT'; }
}
