import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Batch {
  id: string;
  batch_no: string;
  date_planned: string | null;
  date_completed: string | null;
  source: string | null;
  variety: string | null;
  sacks_in: number;
  kg_per_sack: number;
  rice_out: number;
  bran_out: number;
  husk_out: number;
  recovery_pct: number;
  cost_per_rice_sack: number;
  total_cost: number;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
}

interface Toll {
  id: string;
  or_no: string;
  date: string;
  customer: string;
  variety: string | null;
  sacks_in: number;
  kg_per_sack: number;
  rice_out: number;
  bran_out: number;
  husk_out: number;
  recovery_pct: number;
  price_per_sack: number;
  total: number;
  byproduct_disposition: 'customer' | 'rjl';
}

const EMPTY_BATCH = () => ({
  date_planned: '',
  source: '', variety: '',
  sacks_in: 0, kg_per_sack: 50,
  rice_out: 0, bran_out: 0, husk_out: 0,
  cost_per_rice_sack: 0,
  status: 'planned' as Batch['status'],
  notes: '',
});

const EMPTY_TOLL = () => ({
  customer: '', variety: '',
  sacks_in: 0, kg_per_sack: 50,
  rice_out: 0, bran_out: 0, husk_out: 0,
  price_per_sack: 0,
  byproduct_disposition: 'customer' as Toll['byproduct_disposition'],
  notes: '',
});

@Component({
  selector: 'app-milling',
  imports: [FormsModule, Modal],
  template: `
    <div class="ptabs">
      <button class="ptab" [class.on]="tab() === 'internal'" (click)="tab.set('internal')">
        <span class="pt-ico">⚙️</span> Internal Batches
      </button>
      <button class="ptab" [class.on]="tab() === 'toll'" (click)="tab.set('toll')">
        <span class="pt-ico">🤝</span> Toll Milling
      </button>
    </div>

    @if (tab() === 'internal') {
      <div class="krow k4">
        <div class="kc kc-b"><span class="kc-ico">⚙️</span><div class="kc-lbl">Total Batches</div><div class="kc-val">{{ bKpis().total }}</div><div class="kc-sub">{{ bKpis().completed }} completed</div></div>
        <div class="kc kc-a"><span class="kc-ico">🏃</span><div class="kc-lbl">In Progress</div><div class="kc-val">{{ bKpis().inProgress }}</div><div class="kc-sub">Live milling</div></div>
        <div class="kc kc-g"><span class="kc-ico">🌾</span><div class="kc-lbl">Avg Recovery</div><div class="kc-val">{{ bKpis().avgRecovery }}%</div><div class="kc-sub">Across completed</div></div>
        <div class="kc kc-r"><span class="kc-ico">💵</span><div class="kc-lbl">Total Cost MTD</div><div class="kc-val">{{ peso(bKpis().costMtd) }}</div><div class="kc-sub">Posted this month</div></div>
      </div>

      <div class="card mb">
        <div class="card-h">
          <div class="card-t">Internal Milling Batches</div>
          @if (auth.canDo('milling','create')) {
            <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openBatch()">＋ New Batch</button>
          }
        </div>

        @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
        @else if (batches().length === 0) {
          <div class="empty">
            <div class="ico">⚙️</div>
            <div class="title">No milling batches yet</div>
            <div class="hint">Click <strong>＋ New Batch</strong> to schedule one.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr>
                <th>Batch No.</th><th>Planned</th><th>Completed</th><th>Source</th><th>Variety</th>
                <th class="tr">Sacks In</th><th class="tr">Rice Out (MT)</th><th class="tr">Recovery</th>
                <th class="tr">Total Cost</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                @for (b of batches(); track b.id) {
                  <tr>
                    <td class="mono ta">{{ b.batch_no }}</td>
                    <td class="sub mono">{{ b.date_planned || '—' }}</td>
                    <td class="sub mono">{{ b.date_completed || '—' }}</td>
                    <td>{{ b.source || '—' }}</td>
                    <td>{{ b.variety || '—' }}</td>
                    <td class="mono tr">{{ b.sacks_in }}</td>
                    <td class="mono tr">{{ peso2(b.rice_out) }}</td>
                    <td class="mono tr" [class.tg]="b.recovery_pct >= 65">{{ b.recovery_pct }}%</td>
                    <td class="mono tr fw6">{{ peso(b.total_cost) }}</td>
                    <td><span [class]="batchBadge(b.status)">{{ batchLabel(b.status) }}</span></td>
                    <td>
                      @if (b.status !== 'completed' && b.status !== 'cancelled' && auth.canDo('milling','edit')) {
                        <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="advanceBatch(b, $event)">{{ nextBatchLabel(b.status) }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    } @else {
      <div class="krow k4">
        <div class="kc kc-b"><span class="kc-ico">🤝</span><div class="kc-lbl">Toll Jobs MTD</div><div class="kc-val">{{ tKpis().mtdCount }}</div><div class="kc-sub">Customer milling</div></div>
        <div class="kc kc-g"><span class="kc-ico">💵</span><div class="kc-lbl">Toll Revenue MTD</div><div class="kc-val">{{ peso(tKpis().mtdRevenue) }}</div><div class="kc-sub">Per-sack pricing</div></div>
        <div class="kc kc-a"><span class="kc-ico">🌾</span><div class="kc-lbl">Avg Recovery</div><div class="kc-val">{{ tKpis().avgRecovery }}%</div><div class="kc-sub">Customer batches</div></div>
        <div class="kc kc-r"><span class="kc-ico">📦</span><div class="kc-lbl">RJL Byproduct</div><div class="kc-val">{{ tKpis().byprodRjl }}</div><div class="kc-sub">Jobs where RJL keeps bran/husk</div></div>
      </div>

      <div class="card mb">
        <div class="card-h">
          <div class="card-t">Toll Milling Jobs</div>
          @if (auth.canDo('milling','create')) {
            <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openToll()">＋ New Toll Job</button>
          }
        </div>

        @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
        @else if (tolls().length === 0) {
          <div class="empty">
            <div class="ico">🤝</div>
            <div class="title">No toll milling jobs yet</div>
            <div class="hint">Click <strong>＋ New Toll Job</strong> to log a customer milling.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr>
                <th>OR No.</th><th>Date</th><th>Customer</th><th>Variety</th>
                <th class="tr">Sacks In</th><th class="tr">Rice Out (MT)</th><th class="tr">Recovery</th>
                <th class="tr">Price/sack</th><th class="tr">Total</th><th>Byproduct</th>
              </tr></thead>
              <tbody>
                @for (t of tolls(); track t.id) {
                  <tr>
                    <td class="mono ta">{{ t.or_no }}</td>
                    <td class="sub mono">{{ t.date }}</td>
                    <td><b>{{ t.customer }}</b></td>
                    <td>{{ t.variety || '—' }}</td>
                    <td class="mono tr">{{ t.sacks_in }}</td>
                    <td class="mono tr">{{ peso2(t.rice_out) }}</td>
                    <td class="mono tr" [class.tg]="t.recovery_pct >= 65">{{ t.recovery_pct }}%</td>
                    <td class="mono tr">{{ peso(t.price_per_sack) }}</td>
                    <td class="mono tr fw6 tg">{{ peso(t.total) }}</td>
                    <td><span class="pill" [class.pg]="t.byproduct_disposition==='customer'" [class.pv]="t.byproduct_disposition==='rjl'">{{ t.byproduct_disposition }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- Batch modal -->
    <app-modal [open]="showBatch()" [title]="'New Milling Batch'" (closed)="closeBatch()">
      <form (ngSubmit)="saveBatch()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Planned Date</label>
            <input class="ph-input" type="date" [(ngModel)]="batch.date_planned" name="planned" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Source</label>
            <input class="ph-input" [(ngModel)]="batch.source" name="source" placeholder="Warehouse / Lot" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Variety</label>
            <input class="ph-input" [(ngModel)]="batch.variety" name="variety" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Sacks In *</label>
            <input class="ph-input mono" type="number" min="0" [(ngModel)]="batch.sacks_in" name="sacks" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Kg / sack</label>
            <input class="ph-input mono" type="number" min="0" step="0.5" [(ngModel)]="batch.kg_per_sack" name="kgsack" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Rice Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="batch.rice_out" name="rice" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Bran Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="batch.bran_out" name="bran" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Husk Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="batch.husk_out" name="husk" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Recovery (auto)</label>
            <input class="ph-input mono" type="text" [value]="batchRecovery + '%'" readonly />
          </div>
          <div class="ph-field">
            <label class="ph-label">Cost / Rice Sack</label>
            <input class="ph-input mono" type="number" min="0" step="1" [(ngModel)]="batch.cost_per_rice_sack" name="cost" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Status</label>
            <select class="ph-select" [(ngModel)]="batch.status" name="status">
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeBatch()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create batch' }}
          </button>
        </div>
      </form>
    </app-modal>

    <!-- Toll modal -->
    <app-modal [open]="showToll()" [title]="'New Toll Milling Job'" (closed)="closeToll()">
      <form (ngSubmit)="saveToll()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Customer *</label>
            <input class="ph-input" [(ngModel)]="toll.customer" name="customer" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Variety</label>
            <input class="ph-input" [(ngModel)]="toll.variety" name="variety" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Sacks In *</label>
            <input class="ph-input mono" type="number" min="0" [(ngModel)]="toll.sacks_in" name="sacks" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Kg / sack</label>
            <input class="ph-input mono" type="number" min="0" step="0.5" [(ngModel)]="toll.kg_per_sack" name="kgsack" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Rice Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="toll.rice_out" name="rice" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Bran Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="toll.bran_out" name="bran" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Husk Out (MT)</label>
            <input class="ph-input mono" type="number" min="0" step="0.01" [(ngModel)]="toll.husk_out" name="husk" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Recovery (auto)</label>
            <input class="ph-input mono" type="text" [value]="tollRecovery + '%'" readonly />
          </div>
          <div class="ph-field">
            <label class="ph-label">Price / sack</label>
            <input class="ph-input mono" type="number" min="0" step="0.5" [(ngModel)]="toll.price_per_sack" name="price" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Total (auto)</label>
            <input class="ph-input mono tg" type="text" [value]="peso(tollTotal)" readonly />
          </div>
          <div class="ph-field">
            <label class="ph-label">Byproduct goes to</label>
            <select class="ph-select" [(ngModel)]="toll.byproduct_disposition" name="byprod">
              <option value="customer">Customer</option>
              <option value="rjl">RJL retains</option>
            </select>
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeToll()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Log toll job' }}
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

    .ptabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 22px; }
    .ptab {
      padding: 11px 20px; cursor: pointer;
      font-size: 13px; font-weight: 600;
      color: var(--sub);
      background: none; border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .ptab:hover { color: var(--text); }
    .ptab.on { color: var(--gold); border-bottom-color: var(--gold); }
    .pt-ico { font-size: 14px; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pg { background: var(--jade-bg); color: var(--jade); }
    .pv { background: var(--violet-bg); color: var(--violet); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-planned { background: var(--raised);  color: var(--sub); }
    .s-prog    { background: var(--sky-bg);  color: var(--sky);  border: 1px solid var(--sky-rim); }
    .s-done    { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-cancel  { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class Milling {
  auth = inject(AuthService);

  tab = signal<'internal' | 'toll'>('internal');
  loading = signal(true);
  error = signal<string | null>(null);

  batches = signal<Batch[]>([]);
  tolls = signal<Toll[]>([]);

  showBatch = signal(false);
  showToll = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);

  batch = EMPTY_BATCH();
  toll = EMPTY_TOLL();

  bKpis = computed(() => {
    const r = this.batches();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const completed = r.filter(b => b.status === 'completed');
    const avg = completed.length
      ? completed.reduce((s, b) => s + Number(b.recovery_pct), 0) / completed.length
      : 0;
    return {
      total: r.length,
      completed: completed.length,
      inProgress: r.filter(b => b.status === 'in_progress').length,
      avgRecovery: Math.round(avg * 10) / 10,
      costMtd: r.filter(b => b.date_completed && b.date_completed.startsWith(thisMonth))
        .reduce((s, b) => s + Number(b.total_cost), 0),
    };
  });

  tKpis = computed(() => {
    const r = this.tolls();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const mtd = r.filter(t => t.date.startsWith(thisMonth));
    const avg = r.length ? r.reduce((s, t) => s + Number(t.recovery_pct), 0) / r.length : 0;
    return {
      mtdCount: mtd.length,
      mtdRevenue: mtd.reduce((s, t) => s + Number(t.total), 0),
      avgRecovery: Math.round(avg * 10) / 10,
      byprodRjl: r.filter(t => t.byproduct_disposition === 'rjl').length,
    };
  });

  // Plain getters (not computed) — they read the [(ngModel)]-bound plain objects
  // `this.batch` / `this.toll`, which are NOT signals. A computed() over a
  // non-reactive source evaluates once and never re-runs, so it would stay 0.
  // Getters re-evaluate every change-detection pass, so totals track edits live.
  // recovery_pct is numeric(5,2) in Postgres (max 999.99). rice_out / bran_out /
  // husk_out are all captured in MT (see "(MT)" labels), as is the paddy mass we
  // derive from sacks_in × kg_per_sack. A physically sane recovery is ≤ 100%, but a
  // typo (e.g. 8 MT rice from 0.5 MT paddy = 1600%) would overflow the column and
  // throw a raw DB 400 — after the OR/batch number is already burned. We round to
  // one decimal and clamp the STORED value at 999.99 so the insert never overflows;
  // the save paths separately reject > 100% with a friendly inline error.
  private static clampRecovery(pct: number): number {
    if (!Number.isFinite(pct) || pct < 0) return 0;
    return Math.min(999.99, Math.round(pct * 10) / 10);
  }

  get batchRecovery(): number {
    const sacks = Number(this.batch.sacks_in) || 0;
    const kg = Number(this.batch.kg_per_sack) || 0;
    const paddyMt = (sacks * kg) / 1000;
    const rice = Number(this.batch.rice_out) || 0;
    return paddyMt > 0 ? Milling.clampRecovery((rice / paddyMt) * 100) : 0;
  }

  get tollRecovery(): number {
    const sacks = Number(this.toll.sacks_in) || 0;
    const kg = Number(this.toll.kg_per_sack) || 0;
    const paddyMt = (sacks * kg) / 1000;
    const rice = Number(this.toll.rice_out) || 0;
    return paddyMt > 0 ? Milling.clampRecovery((rice / paddyMt) * 100) : 0;
  }

  get tollTotal(): number {
    return (Number(this.toll.sacks_in) || 0) * (Number(this.toll.price_per_sack) || 0);
  }

  get batchTotalCost(): number {
    return (Number(this.batch.rice_out) || 0) * 20 /* sacks per MT approx */ * (Number(this.batch.cost_per_rice_sack) || 0);
  }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [b, t] = await Promise.all([
      supabase.from('milling_batches').select('*').order('date_planned', { ascending: false, nullsFirst: false }),
      supabase.from('toll_milling').select('*').order('date', { ascending: false }),
    ]);
    this.loading.set(false);
    if (b.error) { this.error.set(b.error.message); return; }
    this.batches.set((b.data ?? []) as Batch[]);
    this.tolls.set((t.data ?? []) as Toll[]);
  }

  openBatch() { this.batch = EMPTY_BATCH(); this.formError.set(null); this.showBatch.set(true); }
  closeBatch() { this.showBatch.set(false); }
  openToll() { this.toll = EMPTY_TOLL(); this.formError.set(null); this.showToll.set(true); }
  closeToll() { this.showToll.set(false); }

  async saveBatch() {
    this.saving.set(true);
    this.formError.set(null);

    const recovery = this.batchRecovery;
    const totalCost = this.batchTotalCost;

    // A completed batch with no cost would post ₱0 to the GL and never bill.
    // Planned / in-progress batches legitimately have no rice_out/cost yet.
    if (this.batch.status === 'completed' && totalCost <= 0) {
      this.formError.set('Total cost is ₱0 — enter rice out and cost per sack before completing the batch.');
      this.saving.set(false);
      return;
    }

    // Catch impossible inputs (rice out > paddy in) before we burn a batch number.
    // clampRecovery would otherwise silently cap at 999.99 and store nonsense.
    if (recovery > 100) {
      this.formError.set('Recovery is over 100% — rice out (MT) exceeds the paddy milled. Check the rice-out figure and kg/sack.');
      this.saving.set(false);
      return;
    }

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'MB' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate batch number'); this.saving.set(false); return; }

    const payload = {
      batch_no: noData as string,
      date_planned: this.batch.date_planned || null,
      date_completed: this.batch.status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
      source: this.batch.source || null,
      variety: this.batch.variety || null,
      sacks_in: Number(this.batch.sacks_in) || 0,
      kg_per_sack: Number(this.batch.kg_per_sack) || 50,
      rice_out: Number(this.batch.rice_out) || 0,
      bran_out: Number(this.batch.bran_out) || 0,
      husk_out: Number(this.batch.husk_out) || 0,
      recovery_pct: recovery,
      cost_per_rice_sack: Number(this.batch.cost_per_rice_sack) || 0,
      total_cost: totalCost,
      status: this.batch.status,
      notes: this.batch.notes || null,
    };
    const { error } = await supabase.from('milling_batches').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeBatch();
    await this.load();
  }

  async saveToll() {
    this.saving.set(true);
    this.formError.set(null);

    // A ₱0 toll job never bills and (zero-total guard) never posts to the GL.
    if (this.tollTotal <= 0) {
      this.formError.set('Total is ₱0 — enter sacks in and price per sack before logging the toll job.');
      this.saving.set(false);
      return;
    }

    // Catch impossible inputs (rice out > paddy in) before we burn an OR number.
    // clampRecovery would otherwise silently cap at 999.99 and store nonsense.
    if (this.tollRecovery > 100) {
      this.formError.set('Recovery is over 100% — rice out (MT) exceeds the paddy milled. Check the rice-out figure and kg/sack.');
      this.saving.set(false);
      return;
    }

    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'TM' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate OR number'); this.saving.set(false); return; }

    const payload = {
      or_no: noData as string,
      customer: this.toll.customer,
      variety: this.toll.variety || null,
      sacks_in: Number(this.toll.sacks_in) || 0,
      kg_per_sack: Number(this.toll.kg_per_sack) || 50,
      rice_out: Number(this.toll.rice_out) || 0,
      bran_out: Number(this.toll.bran_out) || 0,
      husk_out: Number(this.toll.husk_out) || 0,
      recovery_pct: this.tollRecovery,
      price_per_sack: Number(this.toll.price_per_sack) || 0,
      total: this.tollTotal,
      byproduct_disposition: this.toll.byproduct_disposition,
      notes: this.toll.notes || null,
    };
    const { error } = await supabase.from('toll_milling').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeToll();
    await this.load();
  }

  async advanceBatch(b: Batch, e: Event) {
    e.stopPropagation();
    const next: Batch['status'] = b.status === 'planned' ? 'in_progress' : b.status === 'in_progress' ? 'completed' : b.status;
    if (next === b.status) return;
    const update: any = { status: next };
    if (next === 'completed') update.date_completed = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('milling_batches').update(update).eq('id', b.id);
    if (error) { alert(error.message); return; }
    await this.load();
  }
  nextBatchLabel(s: Batch['status']) {
    return s === 'planned' ? 'Start' : s === 'in_progress' ? 'Mark Completed' : '—';
  }

  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  peso2(n: number) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

  batchLabel(s: Batch['status']) {
    return s === 'planned' ? 'Planned' : s === 'in_progress' ? 'In Progress' : s === 'completed' ? 'Completed' : 'Cancelled';
  }
  batchBadge(s: Batch['status']) {
    return 'bs ' + (s === 'planned' ? 's-planned' : s === 'in_progress' ? 's-prog' : s === 'completed' ? 's-done' : 's-cancel');
  }
}
