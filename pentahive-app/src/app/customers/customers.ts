import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Customer {
  id: string;
  code: string;
  name: string;
  tin: string | null;
  segment: 'distributor' | 'retail' | 'government' | 'financial';
  stream: 'local' | 'import' | 'mixed';
  credit_limit: number;
  ar_balance: number;
  ytd_sales: number;
  payment_terms: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: 'active' | 'credit_hold' | 'inactive';
}

const EMPTY_FORM = {
  code: '', name: '', tin: '',
  segment: 'distributor' as Customer['segment'],
  stream: 'mixed' as Customer['stream'],
  credit_limit: 0,
  payment_terms: '30d net',
  contact_person: '', phone: '', email: '',
};

@Component({
  selector: 'app-customers',
  imports: [FormsModule, Modal],
  template: `
    <!-- KPIs -->
    <div class="krow k4">
      <div class="kc kc-b">
        <span class="kc-ico">👥</span>
        <div class="kc-lbl">Total Customers</div>
        <div class="kc-val">{{ rows().length }}</div>
        <div class="kc-sub">{{ kpis().active }} active</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">⭐</span>
        <div class="kc-lbl">Avg Credit Limit</div>
        <div class="kc-val">{{ peso(kpis().avgCredit) }}</div>
        <div class="kc-sub">Per account</div>
      </div>
      <div class="kc kc-a">
        <span class="kc-ico">💰</span>
        <div class="kc-lbl">Total AR</div>
        <div class="kc-val">{{ peso(kpis().totalAR) }}</div>
        <div class="kc-sub">Across {{ rows().length }} customers</div>
      </div>
      <div class="kc kc-r">
        <span class="kc-ico">🚨</span>
        <div class="kc-lbl">Credit Hold</div>
        <div class="kc-val">{{ kpis().held }}</div>
        <div class="kc-sub">Exceeded limit</div>
      </div>
    </div>

    <!-- Stream filter -->
    <div class="filter-row">
      <div class="seg">
        <button class="seg-opt" [class.on]="streamFilter() === 'all'"   (click)="streamFilter.set('all')">All</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'local'" (click)="streamFilter.set('local')">🌾 Local</button>
        <button class="seg-opt" [class.on]="streamFilter() === 'import'"(click)="streamFilter.set('import')">🚢 Import</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Customer Master</div>
        @if (auth.canDo('customers','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Customer</button>
        }
      </div>

      @if (loading()) {
        <p class="sub" style="padding:16px 0">Loading…</p>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">{{ error() }}</div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <div class="ico">🗒️</div>
          <div class="title">{{ rows().length === 0 ? 'No customers yet' : 'No customers match this filter' }}</div>
          @if (rows().length === 0) {
            <div class="hint">Click <strong>＋ New Customer</strong> to add one.</div>
          }
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>TIN</th><th>Segment</th><th>Stream</th>
                <th class="tr">Credit Limit</th><th class="tr">AR Balance</th><th>Utilization</th>
                <th>Terms</th><th class="tr">YTD Sales</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtered(); track c.id) {
                <tr>
                  <td class="mono ta">{{ c.code }}</td>
                  <td><b>{{ c.name }}</b></td>
                  <td class="mono">{{ c.tin || '—' }}</td>
                  <td><span class="pill" [class]="segmentPillClass(c.segment)">{{ segmentLabel(c.segment) }}</span></td>
                  <td><span class="stream-pill" [class.local]="c.stream==='local'" [class.import]="c.stream==='import'">{{ streamLabel(c.stream) }}</span></td>
                  <td class="mono tr">{{ peso(c.credit_limit) }}</td>
                  <td class="mono tr" [class.tr2]="utilization(c) >= 90" [class.ta]="utilization(c) >= 50 && utilization(c) < 90">
                    {{ peso(c.ar_balance) }}
                  </td>
                  <td style="width:90px">
                    <div class="util-track">
                      <div class="util-fill"
                           [style.width.%]="utilization(c)"
                           [style.background]="utilColor(utilization(c))"></div>
                    </div>
                  </td>
                  <td class="mono">{{ c.payment_terms || '—' }}</td>
                  <td class="mono tg tr">{{ peso(c.ytd_sales) }}</td>
                  <td>
                    @if (c.status === 'credit_hold') {
                      <span class="bs s-err">🔒 Credit Hold</span>
                    } @else if (c.status === 'active') {
                      <span class="bs s-ok"><span class="dot"></span>Active</span>
                    } @else {
                      <span class="bs s-dim">Inactive</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Create modal -->
    <app-modal [open]="showCreate()" [title]="'New Customer'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="form.code" name="code" required placeholder="e.g. CUS-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Name *</label>
            <input class="ph-input" [(ngModel)]="form.name" name="name" required placeholder="Customer company name" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Segment *</label>
            <select class="ph-select" [(ngModel)]="form.segment" name="segment" required>
              <option value="distributor">Distributor</option>
              <option value="retail">Retail</option>
              <option value="government">Government</option>
              <option value="financial">Financial</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Stream *</label>
            <select class="ph-select" [(ngModel)]="form.stream" name="stream" required>
              <option value="local">Local</option>
              <option value="import">Import</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">TIN</label>
            <input class="ph-input" [(ngModel)]="form.tin" name="tin" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Credit Limit (₱)</label>
            <input class="ph-input" type="number" min="0" step="1000" [(ngModel)]="form.credit_limit" name="credit_limit" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Payment Terms</label>
            <input class="ph-input" [(ngModel)]="form.payment_terms" name="terms" placeholder="COD / 30d net" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Contact Person</label>
            <input class="ph-input" [(ngModel)]="form.contact_person" name="contact" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Phone</label>
            <input class="ph-input" [(ngModel)]="form.phone" name="phone" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Email</label>
            <input class="ph-input" type="email" [(ngModel)]="form.email" name="email" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create customer' }}
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

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pg { background: var(--jade-bg);   color: var(--jade); }
    .pb { background: var(--sky-bg);    color: var(--sky); }
    .pa { background: var(--amber-bg);  color: var(--amber); }
    .pv { background: var(--violet-bg); color: var(--violet); }

    .stream-pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: var(--raised); color: var(--sub); }
    .stream-pill.local  { background: var(--local-bg);  color: var(--local-deep); }
    .stream-pill.import { background: var(--import-bg); color: var(--import-deep); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .bs .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .s-ok  { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-err { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
    .s-dim { background: var(--raised);  color: var(--sub); }

    .util-track { height: 6px; background: var(--raised); border-radius: 3px; }
    .util-fill { height: 100%; border-radius: 3px; transition: width .4s; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
    @media (max-width: 720px) {
      .form-grid { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class Customers {
  auth = inject(AuthService);

  rows = signal<Customer[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  streamFilter = signal<'all' | 'local' | 'import'>('all');

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = { ...EMPTY_FORM };

  filtered = computed(() => {
    const f = this.streamFilter();
    if (f === 'all') return this.rows();
    return this.rows().filter(c => c.stream === f || c.stream === 'mixed');
  });

  kpis = computed(() => {
    const r = this.rows();
    return {
      active: r.filter(x => x.status === 'active').length,
      held:   r.filter(x => x.status === 'credit_hold').length,
      totalAR: r.reduce((s, x) => s + (Number(x.ar_balance) || 0), 0),
      avgCredit: r.length ? r.reduce((s, x) => s + (Number(x.credit_limit) || 0), 0) / r.length : 0,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('milling_customers')
      .select('*')
      .order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Customer[]);
  }

  openCreate() {
    this.form = { ...EMPTY_FORM };
    this.formError.set(null);
    this.showCreate.set(true);
  }
  closeCreate() { this.showCreate.set(false); }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const payload = {
      ...this.form,
      credit_limit: Number(this.form.credit_limit) || 0,
      tin: this.form.tin || null,
      payment_terms: this.form.payment_terms || null,
      contact_person: this.form.contact_person || null,
      phone: this.form.phone || null,
      email: this.form.email || null,
    };
    const { error } = await supabase.from('milling_customers').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  utilization(c: Customer): number {
    if (!c.credit_limit) return 0;
    return Math.min(100, Math.round((c.ar_balance / c.credit_limit) * 100));
  }
  utilColor(pct: number): string {
    if (pct >= 90) return 'var(--rose)';
    if (pct >= 60) return 'var(--gold)';
    return 'var(--jade)';
  }
  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  segmentLabel(s: Customer['segment']) {
    return s === 'distributor' ? 'Distributor'
         : s === 'retail' ? 'Retail Chain'
         : s === 'government' ? 'Government'
         : 'Financial';
  }
  segmentPillClass(s: Customer['segment']) {
    return s === 'distributor' ? 'pb'
         : s === 'retail' ? 'pg'
         : s === 'government' ? 'pv'
         : 'pa';
  }
  streamLabel(s: Customer['stream']) {
    return s === 'local' ? '🌾 Local' : s === 'import' ? '🚢 Import' : 'Mixed';
  }
}
