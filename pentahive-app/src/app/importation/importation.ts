import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

type ShipmentStatus =
  | 'draft' | 'in_transit' | 'arrived' | 'in_clearance' | 'released'
  | 'received' | 'costed' | 'closed' | 'cancelled';

interface ShipmentRow {
  id: string;
  shipment_no: string;
  date: string;
  supplier_id: string | null;
  supplier_name: string | null;
  currency: string;
  fx_rate: number;
  incoterm: string | null;
  invoice_value_php: number;
  status: ShipmentStatus;
  bl_awb_no: string | null;
  expected_arrival: string | null;
}

interface SupplierOption { id: string; name: string; origin: string | null; }
interface ItemOption { id: string; code: string; description: string; uom: string | null; gl_role: string | null; }
interface InventoryOption { id: string; sku: string; product: string; }

interface DraftLine {
  item_id: string;
  description: string;
  uom: string;
  gl_role: string | null;
  qty: number;
  unit_cost_fcy: number;
  inventory_id: string;
}

interface SharedComponent {
  cost_type: string;
  amount_php: number;
  allocation_basis: 'value' | 'weight' | 'qty';
  capitalize: boolean;
  settlement: 'service_bill' | 'foreign_bill' | 'boc_cash';
  supplier_id: string;
  ewt_rate: number;
}

interface LineCostRow {
  line_id: string;
  line_no: number;
  description: string;
  gl_role: string | null;
  qty: number;
  line_total_php: number;
  weight: number;
  duty_php: number;
  other_charges: number;
  import_vat_php: number;
  vat_treatment: 'none' | 'creditable' | 'capitalize';
  vat_overridden: boolean;
}

interface AllocResultLine {
  line_id: string;
  line_no: number;
  description: string;
  gl_role: string;
  qty: number;
  goods_php: number;
  allocated_shared: number;
  duty_php: number;
  import_vat_php: number;
  vat_treatment: string;
  capitalized_total: number;
  final_landed_unit_cost: number;
}

// Read-only reconstruction for an ALREADY-costed shipment. The DB persists
// goods, the shared allocation, and the final unit cost — but NOT the duty /
// import-VAT split (those are baked into final_landed_unit_cost only). So the
// per-line residual below is honestly labelled "duty + VAT", not itemised.
interface CostedViewLine {
  line_no: number;
  description: string;
  gl_role: string | null;
  qty: number;
  goods_php: number;
  allocated_shared: number;
  direct_residual: number;       // final×qty − goods − allocated_shared = duty + capitalised VAT
  capitalized_total: number;     // allocated_shared + direct_residual
  final_landed_unit_cost: number;
}
interface CostedViewComponent {
  cost_type: string;
  amount_php: number;
  allocation_basis: string;
  capitalize: boolean;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const STATUS_FLOW: ShipmentStatus[] = ['draft', 'in_transit', 'arrived', 'in_clearance', 'released'];
// Full happy-path lifecycle for the stepper rail (cancelled is an off-path branch).
const LIFECYCLE: { key: ShipmentStatus; label: string }[] = [
  { key: 'draft',        label: 'Draft' },
  { key: 'in_transit',   label: 'In Transit' },
  { key: 'arrived',      label: 'Arrived' },
  { key: 'in_clearance', label: 'In Clearance' },
  { key: 'released',     label: 'Released' },
  { key: 'received',     label: 'Received' },
  { key: 'costed',       label: 'Costed' },
  { key: 'closed',       label: 'Closed' },
];
const VAT_RATE = 0.12;

const EMPTY_SHIPMENT_FORM = () => ({
  supplier_id: '' as string,
  date: todayIso(),
  currency: 'USD',
  fx_rate: 56,
  incoterm: '' as string,
  bl_awb_no: '' as string,
  expected_arrival: '' as string,
  notes: '' as string,
  lines: [] as DraftLine[],
});

const EMPTY_LINE = (): DraftLine => ({
  item_id: '', description: '', uom: '', gl_role: null,
  qty: 0, unit_cost_fcy: 0, inventory_id: '',
});

@Component({
  selector: 'app-importation',
  imports: [FormsModule, Modal, Icon],
  template: `
    <div class="krow k4">
      <div class="kc kc-b"><span class="kc-ico"><app-icon name="ship" [size]="20" /></span><div class="kc-lbl">Open Shipments</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">Pre-receipt, not cancelled</div></div>
      <div class="kc kc-a"><span class="kc-ico"><app-icon name="landmark" [size]="20" /></span><div class="kc-lbl">In Clearance</div><div class="kc-val">{{ kpis().inClearance }}</div><div class="kc-sub">At BOC</div></div>
      <div class="kc kc-r"><span class="kc-ico"><app-icon name="package-check" [size]="20" /></span><div class="kc-lbl">Received, Not Costed</div><div class="kc-val">{{ kpis().receivedNotCosted }}</div><div class="kc-sub">Awaiting landed cost</div></div>
      <div class="kc kc-g"><span class="kc-ico"><app-icon name="banknote" [size]="20" /></span><div class="kc-lbl">Costed Value MTD</div><div class="kc-val">{{ fmt(kpis().landedMtd) }}</div><div class="kc-sub">Invoice value, costed this month</div></div>
    </div>

    @if (loading()) {
      <div class="card">
        <div class="card-h"><div class="card-t">Import Shipment Register</div></div>
        <div class="skel-wrap">
          @for (n of [1,2,3,4,5]; track n) { <div class="skel" style="height:44px;border-radius:var(--r8)"></div> }
        </div>
      </div>
    }
    @else if (error()) {
      <div class="ph-alert ph-alert-error err-retry">
        <span>{{ error() }}</span>
        <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="load()">Retry</button>
      </div>
    }
    @else {
      <div class="card">
        <div class="card-h">
          <div class="card-t">Import Shipment Register</div>
          <div class="filters">
            <div class="srch">
              <app-icon name="search" [size]="15" />
              <input class="ph-input" [(ngModel)]="search" name="search" placeholder="Search no / supplier / BL…" />
            </div>
            <select class="ph-select" [(ngModel)]="statusFilter" name="status">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="in_transit">In Transit</option>
              <option value="arrived">Arrived</option>
              <option value="in_clearance">In Clearance</option>
              <option value="released">Released</option>
              <option value="received">Received</option>
              <option value="costed">Costed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            @if (auth.canDo('importation','create')) {
              <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openNew()">
                <app-icon name="plus" [size]="14" /> New Shipment
              </button>
            }
          </div>
        </div>
        @if (filtered().length === 0) {
          <div class="empty">
            <div class="ico"><app-icon name="ship" [size]="34" /></div>
            <div class="title">{{ shipments().length === 0 ? 'No shipments yet' : 'No matches' }}</div>
            <div class="hint">{{ shipments().length === 0 ? 'Create an import shipment against a foreign supplier — add lines, advance through clearance, then receive and post landed cost.' : 'Adjust your search or status filter.' }}</div>
            @if (shipments().length === 0 && auth.canDo('importation','create')) {
              <button class="ph-btn ph-btn-primary ph-btn-sm" style="margin-top:14px" (click)="openNew()">
                <app-icon name="plus" [size]="14" /> New Shipment
              </button>
            } @else if (shipments().length > 0) {
              <button class="ph-btn ph-btn-ghost ph-btn-sm" style="margin-top:14px" (click)="clearFilters()">Clear filters</button>
            }
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>Shipment No.</th><th>Date</th><th>Foreign Supplier</th><th>Cur</th><th class="tr">Invoice Value PHP</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (s of filtered(); track s.id) {
                  <tr>
                    <td class="mono ta">{{ s.shipment_no }}</td>
                    <td class="sub mono">{{ s.date }}</td>
                    <td>{{ s.supplier_name || '—' }}</td>
                    <td class="sub mono">{{ s.currency }}</td>
                    <td class="mono tr tb">{{ fmt(s.invoice_value_php) }}</td>
                    <td><span [class]="statusClass(s.status)">{{ statusLabel(s.status) }}</span></td>
                    <td class="tr acts">
                      @if (s.status === 'costed' || s.status === 'closed') {
                        <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="openCosted(s)" title="View landed-cost breakdown">
                          <app-icon name="eye" [size]="13" /> Breakdown
                        </button>
                      }
                      @if (nextStatus(s.status); as nx) {
                        @if (auth.canDo('importation','edit')) {
                          <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="advance(s, nx)" [disabled]="busyId() === s.id" [title]="'Advance to ' + statusLabel(nx)">
                            <app-icon name="arrow-right" [size]="13" /> {{ statusLabel(nx) }}
                          </button>
                        }
                      }
                      @if (canReceive(s.status) && auth.canDo('importation','create')) {
                        <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openReceive(s)">Receive</button>
                      }
                      @if (s.status === 'received' && auth.canDo('importation','create')) {
                        <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openLandedCost(s)">Post Landed Cost</button>
                      }
                      @if (canVoid(s.status) && auth.canDo('importation','delete')) {
                        <button class="ph-btn ph-btn-ghost ph-btn-sm danger-ghost" (click)="confirmVoid(s)">Void</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="legend">
        <span class="lg-item"><span class="rl rl-inv">Inv</span> goods capitalise into inventory WAC</span>
        <span class="lg-sep">·</span>
        <span class="lg-item"><span class="rl rl-ppe">PPE</span> machinery routes to fixed assets</span>
        <span class="lg-sep">·</span>
        <span class="lg-item"><span class="vt vt-credit">Creditable VAT</span> sits outside cost (tax asset)</span>
        <span class="lg-sep">·</span>
        <span class="lg-item"><span class="vt vt-cap">Non-creditable VAT</span> capitalises in</span>
      </div>
    }

    <!-- New / Receive shipment -->
    <app-modal [open]="showShipment()" [title]="receiveMode() ? 'Receive Shipment ' + (editingNo() || '') : 'New Import Shipment'" (closed)="closeShipment()">
      <div class="form-grid">
        <div class="ph-field">
          <label class="ph-label">Foreign Supplier *</label>
          <select class="ph-select" [(ngModel)]="form.supplier_id" name="supplier" [disabled]="receiveMode()">
            <option value="">Select foreign supplier…</option>
            @for (s of foreignSuppliers(); track s.id) {
              <option [value]="s.id">{{ s.name }}{{ s.origin ? ' — ' + s.origin : '' }}</option>
            }
          </select>
        </div>
        <div class="ph-field">
          <label class="ph-label">Date *</label>
          <input class="ph-input" type="date" [(ngModel)]="form.date" name="date" required />
        </div>
        <div class="ph-field">
          <label class="ph-label">Currency *</label>
          <input class="ph-input mono" [(ngModel)]="form.currency" name="currency" placeholder="USD" />
        </div>
        <div class="ph-field">
          <label class="ph-label">FX Rate (→ PHP) *</label>
          <input class="ph-input mono tr" type="number" min="0" step="0.0001" [(ngModel)]="form.fx_rate" name="fx" />
        </div>
        <div class="ph-field">
          <label class="ph-label">Incoterm</label>
          <select class="ph-select" [(ngModel)]="form.incoterm" name="incoterm">
            <option value="">—</option>
            <option value="FOB">FOB</option>
            <option value="CIF">CIF</option>
            <option value="CFR">CFR</option>
            <option value="EXW">EXW</option>
          </select>
        </div>
        <div class="ph-field">
          <label class="ph-label">BL / AWB No.</label>
          <input class="ph-input mono" [(ngModel)]="form.bl_awb_no" name="bl" />
        </div>
        <div class="ph-field">
          <label class="ph-label">Expected Arrival</label>
          <input class="ph-input" type="date" [(ngModel)]="form.expected_arrival" name="exp" />
        </div>
      </div>

      <div class="lines">
        <div class="lines-h">
          <span>Shipment lines</span>
          @if (!receiveMode()) {
            <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="addLine()"><app-icon name="plus" [size]="13" /> Add line</button>
          }
        </div>
        @if (form.lines.length === 0) {
          <p class="sub" style="padding:8px 0">No lines yet. Add at least one item.</p>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead>
                <tr>
                  <th>#</th><th>Item</th><th class="tr">Qty</th><th class="tr">Unit FCY</th>
                  <th class="tr">Unit PHP</th><th>GL Role</th><th>WAC SKU</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (l of form.lines; track $index) {
                  <tr>
                    <td class="mono dim">{{ $index + 1 }}</td>
                    <td>
                      <select class="ph-select" [(ngModel)]="l.item_id" [name]="'item_' + $index" [disabled]="receiveMode()" (ngModelChange)="onItemChange(l)">
                        <option value="">Select item…</option>
                        @for (it of items(); track it.id) {
                          <option [value]="it.id">{{ it.code }} — {{ it.description }}</option>
                        }
                      </select>
                    </td>
                    <td class="tr"><input class="ph-input mono tr qty" type="number" min="0" step="0.0001" [(ngModel)]="l.qty" [name]="'qty_' + $index" [disabled]="receiveMode()" /></td>
                    <td class="tr"><input class="ph-input mono tr qty" type="number" min="0" step="0.0001" [(ngModel)]="l.unit_cost_fcy" [name]="'ucf_' + $index" [disabled]="receiveMode()" /></td>
                    <td class="mono tr sub">{{ fmt(unitPhp(l)) }}</td>
                    <td>
                      @if (l.gl_role) { <span [class]="roleClass(l.gl_role)">{{ roleLabel(l.gl_role) }}</span> } @else { <span class="dim">—</span> }
                    </td>
                    <td>
                      @if (l.gl_role && l.gl_role !== 'ppe_machinery') {
                        <select class="ph-select" [(ngModel)]="l.inventory_id" [name]="'inv_' + $index" [disabled]="receiveMode()">
                          <option value="">Select SKU… *</option>
                          @for (inv of inventory(); track inv.id) {
                            <option [value]="inv.id">{{ inv.sku }} — {{ inv.product }}</option>
                          }
                        </select>
                      } @else if (l.gl_role === 'ppe_machinery') {
                        <span class="dim">PPE — no SKU</span>
                      } @else { <span class="dim">—</span> }
                    </td>
                    <td class="tr">
                      @if (!receiveMode()) {
                        <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="removeLine($index)" aria-label="Remove line"><app-icon name="x" [size]="13" /></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="tot-row"><span>Invoice Value FCY</span><span class="mono">{{ form.currency }} {{ num(invoiceFcy()) }}</span></div>
            <div class="tot-row strong"><span>Invoice Value PHP</span><span class="mono">{{ fmt(invoicePhp()) }}</span></div>
          </div>
        }
      </div>

      @if (shipmentError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ shipmentError() }}</div> }

      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeShipment()">Cancel</button>
        @if (receiveMode()) {
          <button type="button" class="ph-btn ph-btn-primary" [disabled]="savingShipment()" (click)="receiveShipment()">
            {{ savingShipment() ? 'Posting…' : 'Receive (post GR/IR)' }}
          </button>
        } @else {
          <button type="button" class="ph-btn ph-btn-primary" [disabled]="savingShipment() || !canSaveDraft()" (click)="saveDraft()">
            {{ savingShipment() ? 'Saving…' : 'Save Draft' }}
          </button>
        }
      </div>
    </app-modal>

    <!-- Landed cost entry -->
    <app-modal [open]="showLanded()" [title]="'Post Landed Cost — ' + (editingNo() || '')" (closed)="closeLanded()">
      <div class="stepper" aria-label="Shipment lifecycle">
        @for (step of lifecycle; track step.key) {
          <div class="step" [attr.data-state]="stepState(step.key, allocResult().length > 0 ? 'costed' : 'received')">
            <span class="step-dot"></span>
            <span class="step-lbl">{{ step.label }}</span>
          </div>
        }
      </div>

      <div class="lc-sec">
        <div class="lines-h">
          <span>Shared components (allocated across lines)</span>
          <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="addComponent()"><app-icon name="plus" [size]="13" /> Add component</button>
        </div>
        @if (components().length === 0) {
          <p class="sub" style="padding:6px 0">No shared components. Freight, insurance, brokerage, arrastre, trucking-in go here.</p>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead>
                <tr>
                  <th>Cost Type</th><th class="tr">Amount PHP</th><th>Basis</th><th>Settlement</th>
                  <th>Supplier</th><th class="tr">EWT %</th><th></th>
                </tr>
              </thead>
              <tbody>
                @for (c of components(); track $index) {
                  <tr>
                    <td><input class="ph-input" [(ngModel)]="c.cost_type" [name]="'ct_' + $index" placeholder="e.g. Freight" /></td>
                    <td class="tr"><input class="ph-input mono tr amt" type="number" min="0" step="0.01" [(ngModel)]="c.amount_php" [name]="'ca_' + $index" /></td>
                    <td>
                      <select class="ph-select" [(ngModel)]="c.allocation_basis" [name]="'cb_' + $index">
                        <option value="value">Value</option>
                        <option value="weight">Weight</option>
                        <option value="qty">Qty</option>
                      </select>
                    </td>
                    <td>
                      <select class="ph-select" [(ngModel)]="c.settlement" [name]="'cs_' + $index">
                        <option value="service_bill">Local service bill</option>
                        <option value="foreign_bill">Foreign bill</option>
                        <option value="boc_cash">Paid (cash)</option>
                      </select>
                    </td>
                    <td>
                      <select class="ph-select" [(ngModel)]="c.supplier_id" [name]="'csup_' + $index">
                        <option value="">—</option>
                        @for (s of allSuppliers(); track s.id) {
                          <option [value]="s.id">{{ s.name }}</option>
                        }
                      </select>
                    </td>
                    <td class="tr"><input class="ph-input mono tr ewt" type="number" min="0" max="1" step="0.005" [(ngModel)]="c.ewt_rate" [name]="'ce_' + $index" [disabled]="c.settlement !== 'service_bill'" /></td>
                    <td class="tr"><button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="removeComponent($index)"><app-icon name="x" [size]="13" /></button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (weightBasisZero()) {
            <div class="guard-warn">
              <app-icon name="triangle-alert" [size]="15" />
              <span>A component allocates <strong>by weight</strong>, but every line weight is 0. Enter line weights below, or switch that component to value/qty — otherwise posting fails (basis sums to zero).</span>
            </div>
          }
        }
      </div>

      <div class="lc-sec">
        <div class="lines-h"><span>Per-line direct costs (duty + import VAT)</span></div>
        <div class="tw">
          <table class="ph-table">
            <thead>
              <tr>
                <th>#</th><th>Line</th><th>GL Role</th><th class="tr">Goods PHP</th>
                <th class="tr">Weight</th><th class="tr">Duty PHP</th>
                <th class="tr">Other Chg <app-icon name="info" [size]="11" class="th-info" title="Per-line BOC charges (e.g. excise, processing fees) that enter the import-VAT base. NOT the shared freight/insurance above — those allocate separately." /></th>
                <th class="tr">Import VAT PHP</th><th>VAT Treatment</th>
              </tr>
            </thead>
            <tbody>
              @for (lc of lineCosts(); track lc.line_id) {
                <tr>
                  <td class="mono dim">{{ lc.line_no }}</td>
                  <td>{{ lc.description || '—' }}</td>
                  <td>@if (lc.gl_role) { <span [class]="roleClass(lc.gl_role)">{{ roleLabel(lc.gl_role) }}</span> }</td>
                  <td class="mono tr sub">{{ fmt(lc.line_total_php) }}</td>
                  <td class="tr"><input class="ph-input mono tr qty" type="number" min="0" step="0.001" [(ngModel)]="lc.weight" [name]="'w_' + lc.line_id" /></td>
                  <td class="tr"><input class="ph-input mono tr qty" type="number" min="0" step="0.01" [(ngModel)]="lc.duty_php" [name]="'d_' + lc.line_id" (ngModelChange)="recalcVat(lc)" /></td>
                  <td class="tr"><input class="ph-input mono tr qty" type="number" min="0" step="0.01" [(ngModel)]="lc.other_charges" [name]="'oc_' + lc.line_id" (ngModelChange)="recalcVat(lc)" /></td>
                  <td class="tr">
                    <input class="ph-input mono tr qty" type="number" min="0" step="0.01" [(ngModel)]="lc.import_vat_php" [name]="'v_' + lc.line_id" (ngModelChange)="lc.vat_overridden = true" />
                    @if (!lc.vat_overridden) { <div class="vat-auto">12% auto</div> }
                  </td>
                  <td>
                    <select class="ph-select" [(ngModel)]="lc.vat_treatment" [name]="'vt_' + lc.line_id" (ngModelChange)="recalcVat(lc)">
                      <option value="none">Exempt — no VAT</option>
                      <option value="creditable">Creditable (tax asset)</option>
                      <option value="capitalize">Capitalised (into cost)</option>
                    </select>
                    @if (lc.gl_role === 'inv_paddy' || lc.gl_role === 'inv_fg') {
                      <div class="vt-hint">Rice — VAT-exempt</div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="lc-note">
          <strong>Import VAT</strong> auto-computes as 12% × (goods + duty + other charges) per line — override with the BOC-assessed actual.
          <strong>Creditable</strong> VAT posts to Input VAT (outside inventory cost); <strong>capitalised</strong> VAT folds into the unit cost; <strong>exempt</strong> lines carry none.
          <span class="lc-caveat">v1 note: the VAT base excludes the allocated shared cost (freight/insurance), which is added by the posting engine after VAT.</span>
        </p>
      </div>

      <div class="lc-sec">
        <label class="ph-check">
          <input type="checkbox" [(ngModel)]="includeForeignBill" name="incfb" />
          Clear Import GR/IR with the foreign supplier bill now
        </label>
        @if (includeForeignBill) {
          <div class="ph-field" style="max-width:260px;margin-top:8px">
            <label class="ph-label">Foreign Bill Amount PHP</label>
            <input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="foreignBillAmount" name="fba" />
          </div>
        }
      </div>

      @if (allocResult().length > 0) {
        <div class="lc-result">
          <div class="result-head">
            <app-icon name="check" [size]="16" />
            <div>
              <div class="result-t">Landed cost posted</div>
              <div class="result-s">Each line's final unit cost is built up below. Capitalised cost raises inventory WAC / PPE; creditable VAT stays outside cost.</div>
            </div>
          </div>

          <!-- Aggregate reconciliation: Σ per-line shared = Σ capitalised components -->
          @if (enteredCapComponentsTotal() > 0) {
            <div class="recon" [class.recon-ok]="allocReconciled()" [class.recon-bad]="!allocReconciled()">
              <app-icon [name]="allocReconciled() ? 'check' : 'triangle-alert'" [size]="14" />
              <span>Shared cost reconciliation —
                components entered <strong class="mono">{{ fmt(enteredCapComponentsTotal()) }}</strong>
                = allocated across lines <strong class="mono">{{ fmt(allocSharedTotal()) }}</strong>
                @if (allocReconciled()) { <span class="recon-tag">nothing leaked</span> }
                @else { <span class="recon-tag bad">variance {{ fmt(enteredCapComponentsTotal() - allocSharedTotal()) }}</span> }
              </span>
            </div>
          }

          <!-- Per-line cost build-up -->
          <div class="waterfall">
            @for (r of allocResult(); track r.line_id) {
              <div class="wf-line">
                <div class="wf-head">
                  <span class="wf-no mono">{{ r.line_no }}</span>
                  <span class="wf-desc">{{ r.description || 'Line ' + r.line_no }}</span>
                  <span [class]="roleClass(r.gl_role)">{{ roleLabel(r.gl_role) }}</span>
                  <span class="wf-spacer"></span>
                  <span class="wf-final-lbl">Final unit cost</span>
                  <span class="wf-final mono">₱{{ num4(r.final_landed_unit_cost) }}</span>
                </div>

                <div class="wf-bar" role="img" [attr.aria-label]="'Cost build-up for line ' + r.line_no">
                  <div class="seg seg-goods" [style.width.%]="segPct(r.goods_php, r.goods_php + r.capitalized_total)" [title]="'Goods ' + fmt(r.goods_php)"></div>
                  @if (r.allocated_shared > 0) { <div class="seg seg-shared" [style.width.%]="segPct(r.allocated_shared, r.goods_php + r.capitalized_total)" [title]="'Allocated shared ' + fmt(r.allocated_shared)"></div> }
                  @if (r.duty_php > 0) { <div class="seg seg-duty" [style.width.%]="segPct(r.duty_php, r.goods_php + r.capitalized_total)" [title]="'Duty ' + fmt(r.duty_php)"></div> }
                  @if (r.vat_treatment === 'capitalize' && r.import_vat_php > 0) { <div class="seg seg-vat" [style.width.%]="segPct(r.import_vat_php, r.goods_php + r.capitalized_total)" [title]="'Non-creditable VAT ' + fmt(r.import_vat_php)"></div> }
                </div>

                <div class="wf-rows">
                  <div class="wf-row"><span class="dot dot-goods"></span><span>Goods value</span><span class="mono tr">{{ fmt(r.goods_php) }}</span></div>
                  @if (r.allocated_shared > 0) { <div class="wf-row"><span class="dot dot-shared"></span><span>+ Allocated freight / insurance / brokerage</span><span class="mono tr">{{ fmt(r.allocated_shared) }}</span></div> }
                  @if (r.duty_php > 0) { <div class="wf-row"><span class="dot dot-duty"></span><span>+ Customs duty</span><span class="mono tr">{{ fmt(r.duty_php) }}</span></div> }
                  @if (r.vat_treatment === 'capitalize' && r.import_vat_php > 0) { <div class="wf-row"><span class="dot dot-vat"></span><span>+ Non-creditable import VAT</span><span class="mono tr">{{ fmt(r.import_vat_php) }}</span></div> }
                  <div class="wf-row wf-total"><span class="dot dot-final"></span><span>Capitalised landed cost</span><span class="mono tr">{{ fmt(r.goods_php + r.capitalized_total) }}</span></div>
                  @if (r.vat_treatment === 'creditable' && r.import_vat_php > 0) {
                    <div class="wf-row wf-outside"><span class="dot dot-credit"></span><span>Creditable import VAT — booked to Input VAT, outside cost</span><span class="mono tr">{{ fmt(r.import_vat_php) }}</span></div>
                  }
                  @if (r.vat_treatment === 'none') {
                    <div class="wf-row wf-outside"><span class="dot dot-exempt"></span><span>VAT-exempt — no import VAT</span><span class="mono tr dim">—</span></div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      @if (landedError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ landedError() }}</div> }

      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeLanded()">{{ allocResult().length > 0 ? 'Close' : 'Cancel' }}</button>
        @if (allocResult().length === 0) {
          <button type="button" class="ph-btn ph-btn-primary" [disabled]="postingLanded() || weightBasisZero()" (click)="postLanded()" [title]="weightBasisZero() ? 'Enter line weights or change the weight-basis component first' : ''">
            {{ postingLanded() ? 'Posting…' : 'Post Landed Cost' }}
          </button>
        }
      </div>
    </app-modal>

    <!-- Void confirm -->
    <app-modal [open]="showVoid()" [title]="'Void Shipment'" (closed)="closeVoid()">
      @if (voidTarget(); as v) {
        <p class="sub" style="margin-bottom:14px">
          Void <strong class="mono">{{ v.shipment_no }}</strong>?
          @if (v.status === 'received') { This reverses the goods-receipt journal entry and sets the shipment to cancelled. }
          @else { This cancels the shipment. }
          A costed shipment cannot be voided.
        </p>
      }
      @if (voidError()) { <div class="ph-alert ph-alert-error" style="margin-bottom:12px">{{ voidError() }}</div> }
      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeVoid()">Cancel</button>
        <button type="button" class="ph-btn ph-btn-danger" [disabled]="voiding()" (click)="doVoid()">
          {{ voiding() ? 'Voiding…' : 'Void Shipment' }}
        </button>
      </div>
    </app-modal>

    <!-- Costed shipment — read-only landed-cost breakdown -->
    <app-modal [open]="showCosted()" [title]="'Landed Cost Breakdown — ' + (costedShipment()?.shipment_no || '')" (closed)="closeCosted()">
      @if (costedShipment(); as s) {
        <!-- Lifecycle stepper -->
        <div class="stepper" aria-label="Shipment lifecycle">
          @for (step of lifecycle; track step.key) {
            <div class="step" [attr.data-state]="stepState(step.key, s.status)">
              <span class="step-dot"></span>
              <span class="step-lbl">{{ step.label }}</span>
            </div>
          }
        </div>
      }

      @if (costedLoading()) {
        <div class="skel-wrap" style="margin-top:16px">
          @for (n of [1,2,3]; track n) { <div class="skel" style="height:56px;border-radius:var(--r8)"></div> }
        </div>
      } @else if (costedError()) {
        <div class="ph-alert ph-alert-error err-retry" style="margin-top:16px">
          <span>{{ costedError() }}</span>
          @if (costedShipment(); as s) { <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="openCosted(s)">Retry</button> }
        </div>
      } @else if (costedLines().length === 0) {
        <p class="sub" style="padding:18px 0">No lines on this shipment.</p>
      } @else {
        @if (costedComponents().length > 0) {
          <div class="lc-sec">
            <div class="lines-h"><span>Shared components</span></div>
            <div class="tw">
              <table class="ph-table">
                <thead><tr><th>Cost Type</th><th class="tr">Amount PHP</th><th>Basis</th><th>Treatment</th></tr></thead>
                <tbody>
                  @for (c of costedComponents(); track $index) {
                    <tr>
                      <td>{{ c.cost_type }}</td>
                      <td class="mono tr">{{ fmt(c.amount_php) }}</td>
                      <td><span class="basis-tag">{{ c.allocation_basis }}</span></td>
                      <td class="sub">{{ c.capitalize ? 'Capitalised' : 'Expensed' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="tot"><td>Capitalised shared total</td><td class="mono tr tb">{{ fmt(costedCapComponentsTotal()) }}</td><td colspan="2"></td></tr>
                </tfoot>
              </table>
            </div>
            <div class="recon" [class.recon-ok]="costedReconciled()" [class.recon-bad]="!costedReconciled()">
              <app-icon [name]="costedReconciled() ? 'check' : 'triangle-alert'" [size]="14" />
              <span>Capitalised components <strong class="mono">{{ fmt(costedCapComponentsTotal()) }}</strong>
                = allocated across lines <strong class="mono">{{ fmt(costedAllocTotal()) }}</strong>
                @if (costedReconciled()) { <span class="recon-tag">nothing leaked</span> }
                @else { <span class="recon-tag bad">variance {{ fmt(costedCapComponentsTotal() - costedAllocTotal()) }}</span> }
              </span>
            </div>
          </div>
        }

        <div class="lc-sec">
          <div class="lines-h"><span>Per-line cost build-up</span></div>
          <div class="waterfall">
            @for (l of costedLines(); track l.line_no) {
              <div class="wf-line">
                <div class="wf-head">
                  <span class="wf-no mono">{{ l.line_no }}</span>
                  <span class="wf-desc">{{ l.description || 'Line ' + l.line_no }}</span>
                  <span [class]="roleClass(l.gl_role)">{{ roleLabel(l.gl_role) }}</span>
                  <span class="wf-spacer"></span>
                  <span class="wf-final-lbl">Final unit cost</span>
                  <span class="wf-final mono">₱{{ num4(l.final_landed_unit_cost) }}</span>
                </div>
                <div class="wf-bar">
                  <div class="seg seg-goods" [style.width.%]="segPct(l.goods_php, l.goods_php + l.capitalized_total)" [title]="'Goods ' + fmt(l.goods_php)"></div>
                  @if (l.allocated_shared > 0) { <div class="seg seg-shared" [style.width.%]="segPct(l.allocated_shared, l.goods_php + l.capitalized_total)" [title]="'Allocated shared ' + fmt(l.allocated_shared)"></div> }
                  @if (l.direct_residual > 0) { <div class="seg seg-duty" [style.width.%]="segPct(l.direct_residual, l.goods_php + l.capitalized_total)" [title]="'Duty + capitalised VAT ' + fmt(l.direct_residual)"></div> }
                </div>
                <div class="wf-rows">
                  <div class="wf-row"><span class="dot dot-goods"></span><span>Goods value</span><span class="mono tr">{{ fmt(l.goods_php) }}</span></div>
                  @if (l.allocated_shared > 0) { <div class="wf-row"><span class="dot dot-shared"></span><span>+ Allocated freight / insurance / brokerage</span><span class="mono tr">{{ fmt(l.allocated_shared) }}</span></div> }
                  @if (l.direct_residual > 0) { <div class="wf-row"><span class="dot dot-duty"></span><span>+ Duty &amp; non-creditable import VAT <span class="dim">(not itemised after posting)</span></span><span class="mono tr">{{ fmt(l.direct_residual) }}</span></div> }
                  <div class="wf-row wf-total"><span class="dot dot-final"></span><span>Capitalised landed cost</span><span class="mono tr">{{ fmt(l.goods_php + l.capitalized_total) }}</span></div>
                </div>
              </div>
            }
          </div>
          <p class="lc-note">Duty and import VAT are baked into the final unit cost at posting time and are not stored as a separate split — they appear above as one combined line. The full itemised build-up is shown live on the post-landed-cost screen.</p>
        </div>
      }

      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCosted()">Close</button>
      </div>
    </app-modal>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .k4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .kc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 20px; position: relative; overflow: hidden; }
    .kc::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { display: block; margin-bottom: 10px; color: var(--dim); }
    .kc-b .kc-ico { color: var(--sky); }
    .kc-a .kc-ico { color: var(--gold); }
    .kc-r .kc-ico { color: var(--rose); }
    .kc-g .kc-ico { color: var(--jade); }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 24px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }

    .filters { display: flex; align-items: center; gap: 10px; }
    .srch { display: flex; align-items: center; gap: 8px; }
    .srch app-icon { color: var(--sub); }
    .srch .ph-input { min-width: 220px; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { margin-bottom: 8px; color: var(--dim); display: flex; justify-content: center; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); max-width: 460px; margin: 0 auto; line-height: 1.6; }

    .acts { white-space: nowrap; }
    .acts .ph-btn { margin-left: 6px; }
    .acts .danger-ghost { color: var(--rose); }
    .acts .danger-ghost:hover:not(:disabled) { color: var(--rose-d); border-color: var(--rose-rim); background: var(--rose-bg); }

    .err-retry { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

    .legend { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--sub); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .legend .lg-item { display: inline-flex; align-items: center; gap: 6px; }
    .legend .lg-sep { color: var(--ghost); }
    .vt { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
    .vt-credit { color: var(--jade); background: var(--jade-bg); border: 1px solid var(--jade-rim); }
    .vt-cap { color: var(--amber); background: var(--amber-bg); border: 1px solid var(--gold-rim); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .lines { margin-top: 18px; }
    .lines-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
    .lines-h .ph-btn { text-transform: none; letter-spacing: 0; }
    .qty { width: 110px; }
    .amt { width: 130px; }
    .ewt { width: 80px; }
    .rl { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
    .rl-inv { color: var(--sky); background: var(--sky-bg); border: 1px solid var(--sky-rim); }
    .rl-ppe { color: var(--gold); background: var(--gold-bg); border: 1px solid var(--gold-rim); }
    .dim { color: var(--dim); }
    .vat-auto { font-size: 9.5px; color: var(--jade); font-weight: 700; margin-top: 2px; text-align: right; }
    .vt-hint { font-size: 9.5px; color: var(--jade); font-weight: 600; margin-top: 3px; }
    .th-info { color: var(--dim); vertical-align: middle; cursor: help; }
    .basis-tag { font-size: 10px; font-weight: 600; text-transform: capitalize; color: var(--sub); background: var(--raised); border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; }
    .lc-caveat { display: block; margin-top: 4px; color: var(--sub); }

    .totals { margin-top: 14px; margin-left: auto; max-width: 280px; }
    .tot-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; color: var(--sub); }
    .tot-row.strong { color: var(--text); font-weight: 700; border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; }

    .lc-sec { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
    .lc-sec:first-child { border-top: none; padding-top: 0; margin-top: 0; }
    .lc-note { font-size: 11px; color: var(--dim); margin-top: 8px; line-height: 1.5; }
    .ph-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
    .ph-check input { width: 16px; height: 16px; accent-color: var(--gold); }
    /* mono numerals line up in columns */
    .mono { font-variant-numeric: tabular-nums; }

    /* skeletons */
    .skel-wrap { display: flex; flex-direction: column; gap: 8px; }

    /* zero-weight guard */
    .guard-warn { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 9px 12px; font-size: 11.5px; line-height: 1.5; color: var(--amber); background: var(--amber-bg); border: 1px solid var(--gold-rim); border-radius: var(--r8); }
    .guard-warn app-icon { flex-shrink: 0; margin-top: 1px; }
    .guard-warn strong { color: var(--amber); }

    /* lifecycle stepper */
    .stepper { display: flex; align-items: center; flex-wrap: wrap; gap: 0; margin-bottom: 16px; padding: 12px 4px; }
    .step { display: flex; align-items: center; gap: 7px; padding-right: 6px; position: relative; }
    .step:not(:last-child)::after { content: ''; width: 18px; height: 1px; background: var(--border); margin: 0 4px; }
    .step-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ghost); flex-shrink: 0; box-shadow: 0 0 0 3px transparent; transition: background .15s; }
    .step-lbl { font-size: 10.5px; font-weight: 600; color: var(--dim); white-space: nowrap; }
    .step[data-state="done"]   .step-dot { background: var(--jade); }
    .step[data-state="done"]   .step-lbl { color: var(--sub); }
    .step[data-state="active"] .step-dot { background: var(--gold); box-shadow: 0 0 0 3px var(--gold-bg); }
    .step[data-state="active"] .step-lbl { color: var(--text); font-weight: 800; }
    .step[data-state="off"]    .step-dot { background: var(--rose); }

    /* landed-cost result / hero waterfall */
    .lc-result { margin-top: 18px; padding: 16px; border: 1px solid var(--jade-rim); border-radius: var(--r12); background: linear-gradient(180deg, var(--jade-bg), transparent); }
    .result-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
    .result-head app-icon { color: var(--jade); flex-shrink: 0; margin-top: 2px; }
    .result-t { font-size: 13.5px; font-weight: 800; color: var(--text); }
    .result-s { font-size: 11.5px; color: var(--sub); line-height: 1.5; margin-top: 2px; }

    .recon { display: flex; align-items: center; gap: 8px; font-size: 11.5px; line-height: 1.5; padding: 9px 12px; border-radius: var(--r8); margin-bottom: 14px; }
    .recon app-icon { flex-shrink: 0; }
    .recon-ok  { color: var(--jade); background: var(--jade-bg); border: 1px solid var(--jade-rim); }
    .recon-bad { color: var(--rose); background: var(--rose-bg); border: 1px solid var(--rose-rim); }
    .recon strong { font-weight: 800; }
    .recon-tag { display: inline-block; margin-left: 6px; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; padding: 1px 7px; border-radius: 10px; background: var(--jade); color: #fff; }
    .recon-tag.bad { background: var(--rose); }

    .waterfall { display: flex; flex-direction: column; gap: 12px; }
    .wf-line { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r8); padding: 12px 14px; }
    .wf-head { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
    .wf-no { font-size: 11px; color: var(--dim); width: 16px; flex-shrink: 0; }
    .wf-desc { font-size: 12.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wf-spacer { flex: 1; }
    .wf-final-lbl { font-size: 10px; color: var(--sub); text-transform: uppercase; letter-spacing: .5px; }
    .wf-final { font-size: 14px; font-weight: 800; color: var(--text); flex-shrink: 0; }

    .wf-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--raised); margin-bottom: 9px; }
    .seg { height: 100%; transition: width .25s ease; }
    .seg-goods  { background: var(--sky); }
    .seg-shared { background: var(--violet); }
    .seg-duty   { background: var(--gold); }
    .seg-vat    { background: var(--amber); }

    .wf-rows { display: flex; flex-direction: column; gap: 0; }
    .wf-row { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 8px; font-size: 11.5px; color: var(--sub); padding: 3px 0; }
    .wf-row .mono { color: var(--text); }
    .wf-row.wf-total { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 7px; font-weight: 700; color: var(--text); }
    .wf-row.wf-total .mono { font-weight: 800; }
    .wf-row.wf-outside { font-style: italic; color: var(--dim); padding-top: 6px; }
    .wf-row.wf-outside .mono { color: var(--sub); font-style: normal; }
    .dot { width: 8px; height: 8px; border-radius: 2px; }
    .dot-goods  { background: var(--sky); }
    .dot-shared { background: var(--violet); }
    .dot-duty   { background: var(--gold); }
    .dot-vat    { background: var(--amber); }
    .dot-final  { background: var(--text); }
    .dot-credit { background: var(--jade); border-radius: 50%; }
    .dot-exempt { background: var(--ghost); border-radius: 50%; }

    .ph-table tfoot .tot td { border-top: 2px solid var(--rim); font-weight: 800; padding: 11px 14px; }

    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--gold-rim); }
    .s-info { background: var(--sky-bg); color: var(--sky); border: 1px solid var(--sky-rim); }
    .s-mut { background: var(--raised); color: var(--sub); border: 1px solid var(--border); }

    @media (max-width: 960px) { .k4 { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      .stepper { gap: 2px 0; }
      .step-lbl { display: none; }
      .step[data-state="active"] .step-lbl { display: inline; }
    }

    @media print {
      :host { animation: none; }
      .krow, .filters, .acts, .legend { display: none; }
      .card { border: none; padding: 0; }
      .wf-line, .lc-result { break-inside: avoid; }
      .lc-result { border-color: var(--rim); background: none; }
      .seg { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `,
})
export class Importation {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  shipments = signal<ShipmentRow[]>([]);
  foreignSuppliers = signal<SupplierOption[]>([]);
  allSuppliers = signal<SupplierOption[]>([]);
  items = signal<ItemOption[]>([]);
  inventory = signal<InventoryOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  busyId = signal<string | null>(null);

  search = '';
  statusFilter: 'all' | ShipmentStatus = 'all';

  // Shipment create / receive modal
  showShipment = signal(false);
  receiveMode = signal(false);
  editingId = signal<string | null>(null);
  editingNo = signal<string | null>(null);
  savingShipment = signal(false);
  shipmentError = signal<string | null>(null);
  form = EMPTY_SHIPMENT_FORM();

  // Landed cost modal
  showLanded = signal(false);
  postingLanded = signal(false);
  landedError = signal<string | null>(null);
  components = signal<SharedComponent[]>([]);
  lineCosts = signal<LineCostRow[]>([]);
  allocResult = signal<AllocResultLine[]>([]);
  includeForeignBill = false;
  foreignBillAmount = 0;

  // Void modal
  showVoid = signal(false);
  voiding = signal(false);
  voidError = signal<string | null>(null);
  voidTarget = signal<ShipmentRow | null>(null);

  // Costed-shipment read-only view modal
  showCosted = signal(false);
  costedLoading = signal(false);
  costedError = signal<string | null>(null);
  costedShipment = signal<ShipmentRow | null>(null);
  costedLines = signal<CostedViewLine[]>([]);
  costedComponents = signal<CostedViewComponent[]>([]);

  kpis = computed(() => {
    const rows = this.shipments();
    const month = todayIso().slice(0, 7);
    const preReceipt: ShipmentStatus[] = ['draft', 'in_transit', 'arrived', 'in_clearance', 'released'];
    return {
      open: rows.filter(s => preReceipt.includes(s.status)).length,
      inClearance: rows.filter(s => s.status === 'in_clearance').length,
      receivedNotCosted: rows.filter(s => s.status === 'received').length,
      landedMtd: rows.filter(s => s.status === 'costed' && s.date.startsWith(month))
        .reduce((sum, s) => sum + Number(s.invoice_value_php), 0),
    };
  });

  constructor() { this.load(); }

  fmt(n: number) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  num(n: number) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  num4(n: number) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); }

  // search/statusFilter are plain [(ngModel)] fields; recompute in a method so the
  // list tracks edits live in this zoneless app.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.shipments().filter(s => {
      if (this.statusFilter !== 'all' && s.status !== this.statusFilter) return false;
      if (!q) return true;
      return [s.shipment_no, s.supplier_name, s.bl_awb_no, s.currency].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }

  // Live totals over the plain form object — methods, not computed(): they read
  // [(ngModel)]-bound fields that are not signals.
  unitPhp(l: DraftLine) { return Number(l.unit_cost_fcy || 0) * Number(this.form.fx_rate || 0); }
  invoiceFcy() { return this.form.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost_fcy || 0), 0); }
  invoicePhp() { return this.invoiceFcy() * Number(this.form.fx_rate || 0); }
  canSaveDraft() {
    if (!this.form.supplier_id || this.form.lines.length === 0) return false;
    return this.form.lines.every(l => l.item_id && Number(l.qty) > 0 && this.lineSkuOk(l));
  }
  // Goods lines (non-PPE gl_role) must carry an inventory SKU or WAC write-back no-ops.
  lineSkuOk(l: DraftLine) {
    if (!l.gl_role) return false;
    if (l.gl_role === 'ppe_machinery') return true;
    return !!l.inventory_id;
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    const [shipRes, supRes, itemRes, invRes] = await Promise.all([
      supabase.from('import_shipments')
        .select('id, shipment_no, date, supplier_id, currency, fx_rate, incoterm, invoice_value_php, status, bl_awb_no, expected_arrival, suppliers(name)')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, origin').eq('status', 'active').order('name'),
      supabase.from('items').select('id, code, description, uom, gl_role').not('gl_role', 'is', null).order('code'),
      supabase.from('inventory').select('id, sku, product').order('sku'),
    ]);

    if (shipRes.error) { this.error.set(shipRes.error.message); this.loading.set(false); return; }

    this.shipments.set((shipRes.data ?? []).map((s: any) => ({
      id: s.id, shipment_no: s.shipment_no, date: s.date,
      supplier_id: s.supplier_id, supplier_name: s.suppliers?.name ?? null,
      currency: s.currency, fx_rate: Number(s.fx_rate), incoterm: s.incoterm,
      invoice_value_php: Number(s.invoice_value_php), status: s.status,
      bl_awb_no: s.bl_awb_no, expected_arrival: s.expected_arrival,
    })));

    const sup = (supRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name, origin: s.origin ?? null }));
    this.allSuppliers.set(sup);
    this.foreignSuppliers.set(sup.filter(s => (s.origin ?? 'Local') !== 'Local'));
    this.items.set((itemRes.data ?? []).map((i: any) => ({ id: i.id, code: i.code, description: i.description, uom: i.uom, gl_role: i.gl_role })));
    this.inventory.set((invRes.data ?? []).map((v: any) => ({ id: v.id, sku: v.sku, product: v.product })));

    this.loading.set(false);
    this.cdr.markForCheck();
  }

  // ── status lifecycle ──
  nextStatus(s: ShipmentStatus): ShipmentStatus | null {
    const i = STATUS_FLOW.indexOf(s);
    if (i < 0 || i >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[i + 1];
  }
  canReceive(s: ShipmentStatus) { return s === 'released' || s === 'arrived' || s === 'in_clearance' || s === 'in_transit' || s === 'draft'; }
  canVoid(s: ShipmentStatus) { return s !== 'costed' && s !== 'closed' && s !== 'cancelled'; }

  async advance(s: ShipmentRow, to: ShipmentStatus) {
    this.busyId.set(s.id);
    const { error } = await supabase.from('import_shipments').update({ status: to, updated_at: new Date().toISOString() }).eq('id', s.id);
    this.busyId.set(null);
    if (error) { this.error.set(error.message); this.cdr.markForCheck(); return; }
    await this.load();
  }

  // ── create / receive ──
  openNew() {
    this.form = EMPTY_SHIPMENT_FORM();
    this.form.lines = [EMPTY_LINE()];
    this.receiveMode.set(false);
    this.editingId.set(null);
    this.editingNo.set(null);
    this.shipmentError.set(null);
    this.showShipment.set(true);
  }

  addLine() { this.form.lines = [...this.form.lines, EMPTY_LINE()]; }
  removeLine(i: number) { this.form.lines = this.form.lines.filter((_, idx) => idx !== i); }

  onItemChange(l: DraftLine) {
    const it = this.items().find(x => x.id === l.item_id);
    l.gl_role = it?.gl_role ?? null;
    l.description = it?.description ?? '';
    l.uom = it?.uom ?? '';
    if (l.gl_role === 'ppe_machinery') l.inventory_id = '';
  }

  closeShipment() { this.showShipment.set(false); }

  async saveDraft() {
    this.savingShipment.set(true);
    this.shipmentError.set(null);

    if (!this.canSaveDraft()) {
      this.shipmentError.set('Pick a foreign supplier and ensure every line has an item, qty, and (for goods) a WAC SKU.');
      this.savingShipment.set(false); return;
    }

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'IMP' });
    if (noErr || !noData) { this.shipmentError.set(noErr?.message || 'Failed to generate shipment number'); this.savingShipment.set(false); return; }

    const fx = Number(this.form.fx_rate || 0);
    const { data: head, error: headErr } = await supabase.from('import_shipments').insert({
      shipment_no: noData as string,
      date: this.form.date,
      supplier_id: this.form.supplier_id,
      currency: this.form.currency || 'USD',
      fx_rate: fx,
      incoterm: this.form.incoterm || null,
      invoice_value_fcy: this.invoiceFcy(),
      invoice_value_php: this.invoicePhp(),
      bl_awb_no: this.form.bl_awb_no || null,
      expected_arrival: this.form.expected_arrival || null,
      notes: this.form.notes || null,
      status: 'draft',
    }).select('id').single();

    if (headErr || !head) { this.shipmentError.set(headErr?.message || 'Failed to save shipment'); this.savingShipment.set(false); return; }

    const linePayloads = this.form.lines.map((l, i) => ({
      shipment_id: head.id,
      line_no: i + 1,
      item_id: l.item_id,
      inventory_id: l.gl_role === 'ppe_machinery' ? null : (l.inventory_id || null),
      description: l.description || null,
      uom: l.uom || null,
      qty: Number(l.qty),
      unit_cost_fcy: Number(l.unit_cost_fcy),
      unit_cost_php: Number(l.unit_cost_fcy) * fx,
      line_total_fcy: Number(l.qty) * Number(l.unit_cost_fcy),
      line_total_php: Number(l.qty) * Number(l.unit_cost_fcy) * fx,
    }));
    const { error: lineErr } = await supabase.from('import_shipment_lines').insert(linePayloads);
    if (lineErr) { this.shipmentError.set('Shipment saved but lines failed: ' + lineErr.message); this.savingShipment.set(false); return; }

    this.savingShipment.set(false);
    this.closeShipment();
    await this.load();
  }

  // Receive: reload the FULL draft header + lines and pass them all back to the
  // RPC. The RPC's shipment_id branch deletes+rebuilds lines and overwrites the
  // header with coalesce defaults, so partial payloads corrupt the shipment.
  async openReceive(s: ShipmentRow) {
    this.receiveMode.set(true);
    this.editingId.set(s.id);
    this.editingNo.set(s.shipment_no);
    this.shipmentError.set(null);
    this.form = EMPTY_SHIPMENT_FORM();

    const { data: head, error: headErr } = await supabase.from('import_shipments')
      .select('supplier_id, date, currency, fx_rate, incoterm, bl_awb_no, expected_arrival, notes')
      .eq('id', s.id).single();
    if (headErr || !head) { this.shipmentError.set(headErr?.message || 'Failed to load shipment'); this.showShipment.set(true); return; }

    this.form.supplier_id = head.supplier_id ?? '';
    this.form.date = head.date;
    this.form.currency = head.currency;
    this.form.fx_rate = Number(head.fx_rate);
    this.form.incoterm = head.incoterm ?? '';
    this.form.bl_awb_no = head.bl_awb_no ?? '';
    this.form.expected_arrival = head.expected_arrival ?? '';
    this.form.notes = head.notes ?? '';

    const { data: lines, error: lineErr } = await supabase.from('import_shipment_lines')
      .select('item_id, inventory_id, description, uom, qty, unit_cost_fcy, items(gl_role)')
      .eq('shipment_id', s.id).order('line_no');
    if (lineErr) { this.shipmentError.set(lineErr.message); this.showShipment.set(true); return; }

    this.form.lines = (lines ?? []).map((l: any) => ({
      item_id: l.item_id,
      description: l.description ?? '',
      uom: l.uom ?? '',
      gl_role: l.items?.gl_role ?? null,
      qty: Number(l.qty),
      unit_cost_fcy: Number(l.unit_cost_fcy),
      inventory_id: l.inventory_id ?? '',
    }));

    this.showShipment.set(true);
    this.cdr.markForCheck();
  }

  async receiveShipment() {
    const id = this.editingId();
    if (!id) return;
    this.savingShipment.set(true);
    this.shipmentError.set(null);

    const fx = Number(this.form.fx_rate || 0);
    const header = {
      shipment_id: id,
      supplier_id: this.form.supplier_id,
      date: this.form.date,
      currency: this.form.currency || 'USD',
      fx_rate: fx,
      incoterm: this.form.incoterm || null,
      bl_awb_no: this.form.bl_awb_no || null,
      expected_arrival: this.form.expected_arrival || null,
      notes: this.form.notes || null,
    };
    const lines = this.form.lines.map(l => ({
      item_id: l.item_id,
      inventory_id: l.gl_role === 'ppe_machinery' ? null : (l.inventory_id || null),
      description: l.description || null,
      uom: l.uom || null,
      qty: Number(l.qty),
      unit_cost_fcy: Number(l.unit_cost_fcy),
      unit_cost_php: Number(l.unit_cost_fcy) * fx,
    }));

    const { error } = await supabase.rpc('rpc_post_import_receipt', { p_header: header, p_lines: lines });
    if (error) { this.shipmentError.set(error.message); this.savingShipment.set(false); this.cdr.markForCheck(); return; }

    this.savingShipment.set(false);
    this.closeShipment();
    await this.load();
  }

  // ── landed cost ──
  async openLandedCost(s: ShipmentRow) {
    this.editingId.set(s.id);
    this.editingNo.set(s.shipment_no);
    this.landedError.set(null);
    this.components.set([]);
    this.allocResult.set([]);
    this.includeForeignBill = false;
    this.foreignBillAmount = 0;

    const { data: lines, error } = await supabase.from('import_shipment_lines')
      .select('id, line_no, description, qty, line_total_php, items(gl_role)')
      .eq('shipment_id', s.id).order('line_no');
    if (error) { this.landedError.set(error.message); this.showLanded.set(true); return; }

    this.lineCosts.set((lines ?? []).map((l: any) => {
      const role = l.items?.gl_role ?? null;
      return {
        line_id: l.id,
        line_no: l.line_no,
        description: l.description ?? '',
        gl_role: role,
        qty: Number(l.qty),
        line_total_php: Number(l.line_total_php),
        weight: 0,
        duty_php: 0,
        other_charges: 0,
        import_vat_php: 0,
        vat_treatment: this.defaultVatTreatment(role),
        vat_overridden: false,
      };
    }));
    // Seed the 12% auto VAT immediately so creditable/capitalize lines don't
    // post a silent 0 if the operator never touches the duty field.
    for (const lc of this.lineCosts()) this.recalcVat(lc);

    this.showLanded.set(true);
    this.cdr.markForCheck();
  }

  // VAT treatment default mirrors the RPC: exempt paddy/FG → none; packaging/PPE → creditable.
  defaultVatTreatment(role: string | null): LineCostRow['vat_treatment'] {
    if (role === 'inv_paddy' || role === 'inv_fg') return 'none';
    return 'creditable';
  }

  // import_vat_php = 12% × (goods + duty + other charges) per line, unless overridden.
  // Exempt (treatment 'none') lines carry no import VAT line at all.
  recalcVat(lc: LineCostRow) {
    if (lc.vat_overridden) return;
    if (lc.vat_treatment === 'none') { lc.import_vat_php = 0; return; }
    lc.import_vat_php = Math.round((lc.line_total_php + Number(lc.duty_php || 0) + Number(lc.other_charges || 0)) * VAT_RATE * 100) / 100;
  }

  addComponent() {
    this.components.set([...this.components(), {
      cost_type: '', amount_php: 0, allocation_basis: 'value',
      capitalize: true, settlement: 'service_bill', supplier_id: '', ewt_rate: 0.02,
    }]);
  }
  removeComponent(i: number) { this.components.set(this.components().filter((_, idx) => idx !== i)); }

  closeLanded() { this.showLanded.set(false); }

  async postLanded() {
    const id = this.editingId();
    if (!id) return;
    this.postingLanded.set(true);
    this.landedError.set(null);

    const comps = this.components()
      .filter(c => Number(c.amount_php) > 0)
      .map(c => ({
        cost_type: c.cost_type || 'Shared cost',
        amount_php: Number(c.amount_php),
        allocation_basis: c.allocation_basis,
        capitalize: c.capitalize,
        settlement: c.settlement,
        supplier_id: c.supplier_id || null,
        ewt_rate: c.settlement === 'service_bill' ? Number(c.ewt_rate || 0) : 0,
      }));

    const lineCosts = this.lineCosts().map(lc => ({
      line_id: lc.line_id,
      weight: Number(lc.weight || 0),
      duty_php: Number(lc.duty_php || 0),
      import_vat_php: Number(lc.import_vat_php || 0),
      vat_treatment: lc.vat_treatment,
    }));

    const args: any = { p_shipment_id: id, p_components: comps, p_line_costs: lineCosts };
    if (this.includeForeignBill && Number(this.foreignBillAmount) > 0) {
      args.p_foreign_supplier_bill = { amount_php: Number(this.foreignBillAmount) };
    }

    const { data, error } = await supabase.rpc('rpc_post_landed_cost', args);
    if (error) { this.landedError.set(error.message); this.postingLanded.set(false); this.cdr.markForCheck(); return; }

    const res: any = data;
    if (res?.already_posted) {
      this.landedError.set('Landed cost was already posted for this shipment.');
      this.postingLanded.set(false);
      await this.load();
      this.cdr.markForCheck();
      return;
    }

    // Match each RPC result line back to its input row for description / qty / goods.
    const byId = new Map(this.lineCosts().map(lc => [lc.line_id, lc]));
    this.allocResult.set((res?.lines ?? []).map((r: any) => {
      const src = byId.get(r.line_id);
      return {
        line_id: r.line_id, line_no: r.line_no,
        description: src?.description ?? '',
        gl_role: r.gl_role,
        qty: src?.qty ?? 0,
        goods_php: src?.line_total_php ?? 0,
        allocated_shared: Number(r.allocated_shared), duty_php: Number(r.duty_php),
        import_vat_php: Number(r.import_vat_php), vat_treatment: r.vat_treatment,
        capitalized_total: Number(r.capitalized_total),
        final_landed_unit_cost: Number(r.final_landed_unit_cost),
      };
    }));

    this.postingLanded.set(false);
    await this.load();
    this.cdr.markForCheck();
  }

  // ── void ──
  confirmVoid(s: ShipmentRow) {
    this.voidTarget.set(s);
    this.voidError.set(null);
    this.showVoid.set(true);
  }
  closeVoid() { this.showVoid.set(false); }

  async doVoid() {
    const t = this.voidTarget();
    if (!t) return;
    this.voiding.set(true);
    this.voidError.set(null);

    const { error } = await supabase.rpc('rpc_void_import', { p_shipment_id: t.id });
    if (error) { this.voidError.set(error.message); this.voiding.set(false); this.cdr.markForCheck(); return; }

    this.voiding.set(false);
    this.closeVoid();
    await this.load();
  }

  // ── costed-shipment read-only view ──
  async openCosted(s: ShipmentRow) {
    this.costedShipment.set(s);
    this.costedError.set(null);
    this.costedLines.set([]);
    this.costedComponents.set([]);
    this.costedLoading.set(true);
    this.showCosted.set(true);
    this.cdr.markForCheck();

    const [lineRes, compRes] = await Promise.all([
      supabase.from('import_shipment_lines')
        .select('line_no, description, qty, line_total_php, allocated_landed_cost, final_landed_unit_cost, items(gl_role)')
        .eq('shipment_id', s.id).order('line_no'),
      supabase.from('import_landed_costs')
        .select('cost_type, amount_php, allocation_basis, capitalize')
        .eq('shipment_id', s.id).order('created_at'),
    ]);
    const loadErr = lineRes.error || compRes.error;
    if (loadErr) { this.costedError.set(loadErr.message); this.costedLoading.set(false); this.cdr.markForCheck(); return; }

    this.costedLines.set((lineRes.data ?? []).map((l: any) => {
      const goods = Number(l.line_total_php);
      const alloc = Number(l.allocated_landed_cost || 0);
      const qty = Number(l.qty);
      const final = Number(l.final_landed_unit_cost || 0);
      const capTotal = final * qty - goods;
      return {
        line_no: l.line_no,
        description: l.description ?? '',
        gl_role: l.items?.gl_role ?? null,
        qty,
        goods_php: goods,
        allocated_shared: alloc,
        direct_residual: Math.max(0, Math.round((capTotal - alloc) * 100) / 100),
        capitalized_total: Math.round(capTotal * 100) / 100,
        final_landed_unit_cost: final,
      };
    }));
    this.costedComponents.set((compRes.data ?? []).map((c: any) => ({
      cost_type: c.cost_type, amount_php: Number(c.amount_php),
      allocation_basis: c.allocation_basis, capitalize: !!c.capitalize,
    })));
    this.costedLoading.set(false);
    this.cdr.markForCheck();
  }
  closeCosted() { this.showCosted.set(false); }

  costedGoodsTotal() { return this.costedLines().reduce((s, l) => s + l.goods_php, 0); }
  costedAllocTotal() { return this.costedLines().reduce((s, l) => s + l.allocated_shared, 0); }
  costedResidualTotal() { return this.costedLines().reduce((s, l) => s + l.direct_residual, 0); }
  costedFinalTotal() { return this.costedLines().reduce((s, l) => s + l.capitalized_total + l.goods_php, 0); }
  // Σ capitalised shared components — should equal Σ per-line allocated_shared.
  costedCapComponentsTotal() {
    return this.costedComponents().filter(c => c.capitalize).reduce((s, c) => s + c.amount_php, 0);
  }
  costedReconciled() {
    return Math.abs(this.costedCapComponentsTotal() - this.costedAllocTotal()) < 0.02;
  }

  // ── hero waterfall (in-session post result) ──
  allocGoodsTotal()    { return this.allocResult().reduce((s, r) => s + r.goods_php, 0); }
  allocSharedTotal()   { return this.allocResult().reduce((s, r) => s + r.allocated_shared, 0); }
  allocDutyTotal()     { return this.allocResult().reduce((s, r) => s + r.duty_php, 0); }
  allocCapVatTotal()   { return this.allocResult().reduce((s, r) => s + (r.vat_treatment === 'capitalize' ? r.import_vat_php : 0), 0); }
  allocCreditVatTotal(){ return this.allocResult().reduce((s, r) => s + (r.vat_treatment === 'creditable' ? r.import_vat_php : 0), 0); }
  allocFinalTotal()    { return this.allocResult().reduce((s, r) => s + r.goods_php + r.capitalized_total, 0); }
  // Σ capitalised shared components entered = Σ per-line allocated_shared (aggregate reconciliation).
  enteredCapComponentsTotal() {
    return this.components().filter(c => c.capitalize && Number(c.amount_php) > 0).reduce((s, c) => s + Number(c.amount_php), 0);
  }
  allocReconciled() {
    return Math.abs(this.enteredCapComponentsTotal() - this.allocSharedTotal()) < 0.02;
  }

  // Build-up bar segments for one line: goods / shared / duty / capitalised VAT.
  // Creditable VAT is excluded on purpose — it sits OUTSIDE inventory cost.
  segPct(value: number, total: number) {
    if (total <= 0) return 0;
    return Math.max(0, (value / total) * 100);
  }

  // ── pre-submit guard: weight basis with all weights zero ──
  weightBasisZero() {
    const usesWeight = this.components().some(c => c.allocation_basis === 'weight' && Number(c.amount_php) > 0 && c.capitalize);
    if (!usesWeight) return false;
    return this.lineCosts().every(lc => Number(lc.weight || 0) === 0);
  }

  // ── lifecycle stepper ──
  lifecycle = LIFECYCLE;
  lifecycleIndex(s: ShipmentStatus) { return LIFECYCLE.findIndex(x => x.key === s); }
  stepState(stepKey: ShipmentStatus, current: ShipmentStatus): 'done' | 'active' | 'todo' | 'off' {
    if (current === 'cancelled') return 'off';
    const ci = this.lifecycleIndex(current);
    const si = this.lifecycleIndex(stepKey);
    if (si < ci) return 'done';
    if (si === ci) return 'active';
    return 'todo';
  }
  vatTreatmentLabel(t: string) {
    switch (t) {
      case 'none':       return 'Exempt';
      case 'creditable': return 'Creditable';
      case 'capitalize': return 'Capitalised';
      default:           return t;
    }
  }
  capitalizesToPpe(role: string | null) { return role === 'ppe_machinery'; }

  // ── status display ──
  statusClass(s: ShipmentStatus) {
    switch (s) {
      case 'costed':
      case 'closed':    return 'bs s-ok';
      case 'received':  return 'bs s-warn';
      case 'cancelled': return 'bs s-mut';
      default:          return 'bs s-info';
    }
  }
  statusLabel(s: ShipmentStatus) {
    return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  roleLabel(role: string | null) {
    switch (role) {
      case 'inv_paddy':     return 'Inv · Paddy';
      case 'inv_packaging': return 'Inv · Packaging';
      case 'inv_fg':        return 'Inv · FG';
      case 'ppe_machinery': return 'PPE · Machinery';
      default:              return role ?? '—';
    }
  }
  // PPE routes to fixed assets (gold), inventory roles raise WAC (sky).
  roleClass(role: string | null) {
    return role === 'ppe_machinery' ? 'rl rl-ppe' : 'rl rl-inv';
  }
  clearFilters() { this.search = ''; this.statusFilter = 'all'; }
}
