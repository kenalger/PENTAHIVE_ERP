import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Ticket {
  id: string;
  or_no: string;
  ts: string;
  plate: string | null;
  customer: string | null;
  mode: 'single' | 'two-way';
  gross: number;
  tare: number;
  net: number;
  price: number;
  payment: 'cash' | 'credit';
  operator: string | null;
  notes: string | null;
}

const EMPTY_FORM = () => ({
  plate: '', customer: '',
  mode: 'two-way' as Ticket['mode'],
  gross: 0, tare: 0,
  price: 0,
  payment: 'cash' as Ticket['payment'],
  operator: '',
  notes: '',
});

@Component({
  selector: 'app-weighbridge',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-b"><span class="kc-ico">⚖️</span><div class="kc-lbl">Tickets Today</div><div class="kc-val">{{ kpis().today }}</div><div class="kc-sub">{{ peso2(kpis().todayNet) }} net</div></div>
      <div class="kc kc-g"><span class="kc-ico">📊</span><div class="kc-lbl">Tickets MTD</div><div class="kc-val">{{ kpis().mtd }}</div><div class="kc-sub">{{ peso2(kpis().mtdNet) }} net</div></div>
      <div class="kc kc-a"><span class="kc-ico">💵</span><div class="kc-lbl">Revenue MTD</div><div class="kc-val">{{ peso(kpis().mtdRevenue) }}</div><div class="kc-sub">{{ kpis().cashMtd }} cash · {{ kpis().creditMtd }} credit</div></div>
      <div class="kc kc-r"><span class="kc-ico">⏱️</span><div class="kc-lbl">Pending Two-way</div><div class="kc-val">{{ kpis().pending }}</div><div class="kc-sub">Gross only, no tare yet</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Weighbridge Tickets</div>
        @if (auth.canDo('weighbridge','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Ticket</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">⚖️</div>
          <div class="title">No tickets yet</div>
          <div class="hint">Click <strong>＋ New Ticket</strong> to weigh a vehicle.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead>
              <tr><th>OR No.</th><th>Timestamp</th><th>Plate</th><th>Customer</th><th>Mode</th>
                  <th class="tr">Gross (kg)</th><th class="tr">Tare (kg)</th><th class="tr">Net (kg)</th>
                  <th class="tr">Price</th><th>Payment</th><th>Operator</th></tr>
            </thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr>
                  <td class="mono ta">{{ t.or_no }}</td>
                  <td class="sub mono">{{ formatDt(t.ts) }}</td>
                  <td class="mono">{{ t.plate || '—' }}</td>
                  <td>{{ t.customer || '—' }}</td>
                  <td><span class="pill" [class.pg]="t.mode==='single'" [class.pb]="t.mode==='two-way'">{{ t.mode }}</span></td>
                  <td class="mono tr">{{ kgFmt(t.gross) }}</td>
                  <td class="mono tr sub">{{ kgFmt(t.tare) }}</td>
                  <td class="mono tr fw6 tg">{{ kgFmt(t.net) }}</td>
                  <td class="mono tr">{{ t.price > 0 ? peso(t.price) : '—' }}</td>
                  <td><span [class]="payClass(t.payment)">{{ t.payment }}</span></td>
                  <td class="sub">{{ t.operator || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Weighbridge Ticket'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Plate</label>
            <input class="ph-input mono" [(ngModel)]="form.plate" name="plate" placeholder="ABC-1234" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Customer / Counterparty</label>
            <input class="ph-input" [(ngModel)]="form.customer" name="customer" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Mode *</label>
            <select class="ph-select" [(ngModel)]="form.mode" name="mode" required>
              <option value="single">Single weigh</option>
              <option value="two-way">Two-way (gross + tare)</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Gross (kg) *</label>
            <input class="ph-input mono" type="number" min="0" step="0.5" [(ngModel)]="form.gross" name="gross" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Tare (kg)</label>
            <input class="ph-input mono" type="number" min="0" step="0.5" [(ngModel)]="form.tare" name="tare" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Net (kg)</label>
            <input class="ph-input mono" type="number" [value]="netPreview()" readonly />
            <span class="help">Computed at save: gross − tare</span>
          </div>
          <div class="ph-field">
            <label class="ph-label">Price (₱)</label>
            <input class="ph-input mono" type="number" min="0" step="1" [(ngModel)]="form.price" name="price" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Payment</label>
            <select class="ph-select" [(ngModel)]="form.payment" name="payment">
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          <div class="ph-field">
            <label class="ph-label">Operator</label>
            <input class="ph-input" [(ngModel)]="form.operator" name="operator" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="form.notes" name="notes" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Issue ticket' }}
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
    .help { font-size: 10.5px; color: var(--dim); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pg { background: var(--jade-bg); color: var(--jade); }
    .pb { background: var(--sky-bg);  color: var(--sky); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-cash    { background: var(--jade-bg);  color: var(--jade);  border: 1px solid var(--jade-rim); }
    .s-credit  { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(245,158,11,.25); }
  `,
})
export class Weighbridge {
  auth = inject(AuthService);
  rows = signal<Ticket[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  // Method, not computed(): reads `this.form`, a plain [(ngModel)]-bound object
  // that is NOT a signal, so a computed() would freeze the net preview at its
  // construction value. A method re-evaluates every CD pass as gross/tare change.
  netPreview() { return (Number(this.form.gross) || 0) - (Number(this.form.tare) || 0); }

  kpis = computed(() => {
    const r = this.rows();
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const todayRows = r.filter(t => t.ts.startsWith(today));
    const mtdRows = r.filter(t => t.ts.startsWith(thisMonth));
    return {
      today: todayRows.length,
      todayNet: todayRows.reduce((s, t) => s + Number(t.net), 0),
      mtd: mtdRows.length,
      mtdNet: mtdRows.reduce((s, t) => s + Number(t.net), 0),
      mtdRevenue: mtdRows.reduce((s, t) => s + Number(t.price), 0),
      cashMtd: mtdRows.filter(t => t.payment === 'cash').length,
      creditMtd: mtdRows.filter(t => t.payment === 'credit').length,
      pending: r.filter(t => t.mode === 'two-way' && (!t.tare || t.tare === 0)).length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('weighbridge_tickets')
      .select('id, or_no, ts, plate, customer, mode, gross, tare, net, price, payment, operator, notes')
      .order('ts', { ascending: false })
      .limit(200);
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Ticket[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    if (!this.form.gross || Number(this.form.gross) <= 0) {
      this.formError.set('Gross weight is required.'); this.saving.set(false); return;
    }
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'WT' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate ticket number'); this.saving.set(false); return; }

    const payload = {
      or_no: noData as string,
      plate: this.form.plate || null,
      customer: this.form.customer || null,
      mode: this.form.mode,
      gross: Number(this.form.gross),
      tare: Number(this.form.tare) || 0,
      price: Number(this.form.price) || 0,
      payment: this.form.payment,
      operator: this.form.operator || null,
      notes: this.form.notes || null,
    };
    const { error } = await supabase.from('weighbridge_tickets').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  formatDt(s: string) {
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  peso2(kg: number) { return (kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' MT'; }
  kgFmt(kg: number) { return Number(kg).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  payClass(p: Ticket['payment']) { return 'bs ' + (p === 'cash' ? 's-cash' : 's-credit'); }
}
