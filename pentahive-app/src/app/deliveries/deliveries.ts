import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Delivery {
  id: string;
  no: string;
  so_no: string | null;
  customer_name: string | null;
  truck_no: string | null;
  driver: string | null;
  destination: string | null;
  dispatch_at: string | null;
  status: 'scheduled' | 'in_transit' | 'delivered' | 'delayed' | 'cancelled';
}

interface SOOption {
  id: string; no: string; customer_name: string;
}

const EMPTY_FORM = () => ({
  so_id: '',
  so_no: null as string | null,
  customer_name: null as string | null,
  truck_no: '',
  driver: '',
  destination: '',
  dispatch_at: '',
  status: 'scheduled' as Delivery['status'],
});

@Component({
  selector: 'app-deliveries',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-b"><span class="kc-ico">🚛</span><div class="kc-lbl">Deliveries MTD</div><div class="kc-val">{{ kpis().mtd }}</div><div class="kc-sub">{{ kpis().mtdDelivered }} delivered</div></div>
      <div class="kc kc-g"><span class="kc-ico">✅</span><div class="kc-lbl">Delivered Today</div><div class="kc-val">{{ kpis().today }}</div><div class="kc-sub">Confirmed today</div></div>
      <div class="kc kc-a"><span class="kc-ico">📍</span><div class="kc-lbl">In Transit</div><div class="kc-val">{{ kpis().transit }}</div><div class="kc-sub">On the road</div></div>
      <div class="kc kc-r"><span class="kc-ico">⚠️</span><div class="kc-lbl">Delayed</div><div class="kc-val">{{ kpis().delayed }}</div><div class="kc-sub">Needs follow-up</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Delivery Order Register</div>
        @if (auth.canDo('deliveries','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New DO</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">🚛</div>
          <div class="title">No delivery orders yet</div>
          <div class="hint">Create one from a confirmed SO.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>DO No.</th><th>SO Ref</th><th>Customer</th><th>Truck</th><th>Driver</th><th>Destination</th><th>Dispatch</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (d of rows(); track d.id) {
                <tr>
                  <td class="mono tt">{{ d.no }}</td>
                  <td class="mono tb">{{ d.so_no || '—' }}</td>
                  <td>{{ d.customer_name || '—' }}</td>
                  <td class="mono">{{ d.truck_no || '—' }}</td>
                  <td>{{ d.driver || '—' }}</td>
                  <td class="sub">{{ d.destination || '—' }}</td>
                  <td class="sub mono">{{ d.dispatch_at ? formatDt(d.dispatch_at) : '—' }}</td>
                  <td><span [class]="badgeClass(d.status)">{{ statusLabel(d.status) }}</span></td>
                  <td>
                    @if (d.status !== 'delivered' && d.status !== 'cancelled' && auth.canDo('deliveries','edit')) {
                      <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="advance(d, $event)">{{ nextLabel(d.status) }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (selected(); as d) {
      <div class="card mb">
        <div class="card-h">
          <div class="card-t">Tracker — {{ d.no }}</div>
          <span [class]="badgeClass(d.status)">{{ statusLabel(d.status) }}</span>
        </div>
        <div class="track-bar">
          <div class="track-step" [class.done]="passedStage(d.status, 0)" [class.cur]="d.status === 'scheduled'">
            <div class="track-dot">{{ passedStage(d.status, 0) && d.status !== 'scheduled' ? '✓' : '1' }}</div>
            <div class="track-lbl">Scheduled</div>
          </div>
          <div class="track-step" [class.done]="passedStage(d.status, 1)" [class.cur]="d.status === 'in_transit'">
            <div class="track-dot">{{ passedStage(d.status, 1) && d.status !== 'in_transit' ? '✓' : '2' }}</div>
            <div class="track-lbl">In Transit</div>
          </div>
          <div class="track-step" [class.done]="passedStage(d.status, 2)" [class.cur]="d.status === 'delivered'">
            <div class="track-dot">{{ d.status === 'delivered' ? '✓' : '3' }}</div>
            <div class="track-lbl">Delivered</div>
          </div>
        </div>
      </div>
    }

    <app-modal [open]="showCreate()" [title]="'New Delivery Order'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-3">
            <label class="ph-label">Source SO</label>
            <select class="ph-select" [(ngModel)]="form.so_id" name="so" (change)="onSoChange()">
              <option value="">— None (manual entry) —</option>
              @for (s of soOptions(); track s.id) {
                <option [value]="s.id">{{ s.no }} · {{ s.customer_name }}</option>
              }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Truck Plate</label>
            <input class="ph-input mono" [(ngModel)]="form.truck_no" name="truck" placeholder="e.g. TRK-001" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Driver</label>
            <input class="ph-input" [(ngModel)]="form.driver" name="driver" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Dispatch At</label>
            <input class="ph-input" type="datetime-local" [(ngModel)]="form.dispatch_at" name="dispatch" />
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Destination</label>
            <input class="ph-input" [(ngModel)]="form.destination" name="destination" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Schedule delivery' }}
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
    .form-grid .col-3 { grid-column: span 3; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    /* Tracker */
    .track-bar { display: flex; align-items: center; margin: 12px 0; }
    .track-step { flex: 1; position: relative; text-align: center; }
    .track-step::after { content: ''; position: absolute; top: 13px; left: 50%; right: -50%; height: 2px; background: var(--raised); z-index: 0; }
    .track-step:last-child::after { display: none; }
    .track-step.done::after { background: var(--jade); }
    .track-dot { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--border); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; margin: 0 auto 6px; position: relative; z-index: 1; background: var(--surface); color: var(--sub); }
    .track-step.done .track-dot { background: var(--jade); border-color: var(--jade); color: #fff; }
    .track-step.cur .track-dot { background: var(--gold-bg); border-color: var(--gold); color: var(--gold); box-shadow: 0 0 12px var(--gold-bg); }
    .track-lbl { font-size: 10px; color: var(--dim); }
    .track-step.done .track-lbl { color: var(--jade); }
    .track-step.cur .track-lbl { color: var(--gold); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-sched   { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-transit { background: var(--sky-bg);  color: var(--sky);  border: 1px solid var(--sky-rim); }
    .s-deliv   { background: var(--teal-bg); color: var(--teal); border: 1px solid var(--teal-rim); }
    .s-delay   { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
    .s-can     { background: var(--raised);  color: var(--sub); }
  `,
})
export class Deliveries {
  auth = inject(AuthService);
  rows = signal<Delivery[]>([]);
  soOptions = signal<SOOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  selected = computed<Delivery | null>(() => {
    const inTransit = this.rows().find(d => d.status === 'in_transit');
    return inTransit ?? this.rows()[0] ?? null;
  });

  kpis = computed(() => {
    const r = this.rows();
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const mtd = r.filter(x => x.dispatch_at && x.dispatch_at.startsWith(thisMonth));
    return {
      mtd: mtd.length,
      mtdDelivered: mtd.filter(x => x.status === 'delivered').length,
      today: r.filter(x => x.status === 'delivered' && x.dispatch_at && x.dispatch_at.startsWith(today)).length,
      transit: r.filter(x => x.status === 'in_transit').length,
      delayed: r.filter(x => x.status === 'delayed').length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [del, so] = await Promise.all([
      supabase.from('milling_deliveries')
        .select('id, no, so_no, customer_name, truck_no, driver, destination, dispatch_at, status')
        .order('created_at', { ascending: false }),
      supabase.from('milling_sales_orders')
        .select('id, no, milling_customers(name)')
        .in('status', ['confirmed', 'in_transit'])
        .order('created_at', { ascending: false }),
    ]);
    this.loading.set(false);
    if (del.error) { this.error.set(del.error.message); return; }
    this.rows.set((del.data ?? []) as Delivery[]);
    this.soOptions.set((so.data ?? []).map((s: any) => ({
      id: s.id, no: s.no, customer_name: s.customers?.name ?? '—',
    })));
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  onSoChange() {
    const s = this.soOptions().find(x => x.id === this.form.so_id);
    this.form.so_no = s?.no ?? null;
    this.form.customer_name = s?.customer_name ?? null;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'DO' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate DO number'); this.saving.set(false); return; }

    const { error } = await supabase.from('milling_deliveries').insert({
      no: noData as string,
      so_id: this.form.so_id || null,
      so_no: this.form.so_no,
      customer_name: this.form.customer_name,
      truck_no: this.form.truck_no || null,
      driver: this.form.driver || null,
      destination: this.form.destination || null,
      dispatch_at: this.form.dispatch_at ? new Date(this.form.dispatch_at).toISOString() : null,
      status: this.form.status,
    });

    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  async advance(d: Delivery, e: Event) {
    e.stopPropagation();
    const next: Delivery['status'] = d.status === 'scheduled' ? 'in_transit' : d.status === 'in_transit' ? 'delivered' : d.status;
    if (next === d.status) return;
    const { error } = await supabase.from('milling_deliveries').update({ status: next }).eq('id', d.id);
    if (error) { alert(error.message); return; }
    await this.load();
  }
  nextLabel(s: Delivery['status']) {
    return s === 'scheduled' ? 'Dispatch' : s === 'in_transit' ? 'Mark Delivered' : '—';
  }

  passedStage(status: Delivery['status'], stage: number): boolean {
    const order: Record<Delivery['status'], number> = {
      scheduled: 0, in_transit: 1, delivered: 2, delayed: 1, cancelled: 0,
    };
    return order[status] >= stage;
  }

  formatDt(s: string) {
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  statusLabel(s: Delivery['status']) {
    return s === 'scheduled' ? 'Scheduled'
         : s === 'in_transit' ? 'In Transit'
         : s === 'delivered' ? 'Delivered'
         : s === 'delayed' ? 'Delayed'
         : 'Cancelled';
  }
  badgeClass(s: Delivery['status']) {
    return 'bs ' + (
      s === 'scheduled' ? 's-sched' :
      s === 'in_transit' ? 's-transit' :
      s === 'delivered' ? 's-deliv' :
      s === 'delayed' ? 's-delay' :
      's-can'
    );
  }
}
