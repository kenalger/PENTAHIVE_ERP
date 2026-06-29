import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Supplier {
  id: string;
  code: string;
  name: string;
  tin: string | null;
  category: 'paddy' | 'import' | 'packaging' | 'equipment' | 'office';
  origin: string | null;
  bir_registered: boolean;
  ewt_rate: number;
  payment_terms: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: 'active' | 'inactive';
  ytd_purchases: number;
}

const EMPTY_FORM = {
  code: '', name: '', tin: '',
  category: 'paddy' as Supplier['category'],
  origin: 'Local', bir_registered: true, ewt_rate: 0,
  payment_terms: '30d net', contact_person: '', phone: '', email: '',
};

@Component({
  selector: 'app-suppliers',
  imports: [FormsModule, Modal],
  template: `
    <!-- KPIs -->
    <div class="krow k4">
      <div class="kc kc-b">
        <span class="kc-ico">🏭</span>
        <div class="kc-lbl">Total Suppliers</div>
        <div class="kc-val">{{ rows().length }}</div>
        <div class="kc-sub">{{ kpis().bir }} BIR · {{ kpis().nonBir }} non-BIR</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">✅</span>
        <div class="kc-lbl">Active</div>
        <div class="kc-val">{{ kpis().active }}</div>
        <div class="kc-sub">of {{ rows().length }} total</div>
      </div>
      <div class="kc kc-r">
        <span class="kc-ico">⚠️</span>
        <div class="kc-lbl">EWT Flagged</div>
        <div class="kc-val">{{ kpis().nonBir }}</div>
        <div class="kc-sub">Requires 2307 issuance</div>
      </div>
      <div class="kc kc-a">
        <span class="kc-ico">🌏</span>
        <div class="kc-lbl">Foreign</div>
        <div class="kc-val">{{ kpis().foreign }}</div>
        <div class="kc-sub">Origin ≠ Local / PH</div>
      </div>
    </div>

    <!-- Table -->
    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Supplier Registry</div>
        @if (auth.canDo('suppliers','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ Add Supplier</button>
        }
      </div>

      @if (loading()) {
        <p class="sub" style="padding:16px 0">Loading…</p>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">{{ error() }}</div>
      } @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">📭</div>
          <div class="title">No suppliers yet</div>
          <div class="hint">Click <strong>＋ Add Supplier</strong> to register one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>TIN / BIR</th><th>Category</th>
                <th>Origin</th><th>Terms</th><th class="tr">YTD Purchases</th>
                <th>EWT Rate</th><th>Status</th><th>Contact</th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows(); track s.id) {
                <tr>
                  <td class="mono ta">{{ s.code }}</td>
                  <td><b>{{ s.name }}</b></td>
                  <td class="mono">{{ s.tin || '—' }}</td>
                  <td><span class="pill" [class]="categoryPillClass(s.category)">{{ categoryLabel(s.category) }}</span></td>
                  <td>{{ s.origin || '—' }}</td>
                  <td class="mono">{{ s.payment_terms || '—' }}</td>
                  <td class="mono tg tr">{{ peso(s.ytd_purchases) }}</td>
                  <td class="mono" [class.tr2]="!s.bir_registered" [class.dim]="s.bir_registered">
                    {{ s.bir_registered ? '—' : (s.ewt_rate + '% EWT') }}
                  </td>
                  <td>
                    @if (s.bir_registered) {
                      <span class="bs s-bir">✔ BIR Registered</span>
                    } @else {
                      <span class="bs s-nobir">✘ Non-BIR</span>
                    }
                  </td>
                  <td class="sub">{{ s.contact_person || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (kpis().nonBir > 0) {
      <div class="ph-alert ph-alert-warn">
        ⚠️ <strong>Compliance Notice:</strong> {{ kpis().nonBir }} non-BIR supplier(s) require Expanded Withholding Tax (EWT) deduction.
        Ensure BIR Form 2307 is issued quarterly.
      </div>
    }

    <!-- Create modal -->
    <app-modal [open]="showCreate()" [title]="'Add Supplier'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="form.code" name="code" required placeholder="e.g. SUP-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Name *</label>
            <input class="ph-input" [(ngModel)]="form.name" name="name" required placeholder="Supplier company name" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Status</label>
            <select class="ph-select" [(ngModel)]="form.bir_registered" name="bir">
              <option [ngValue]="true">BIR Registered</option>
              <option [ngValue]="false">Non-BIR</option>
            </select>
          </div>

          <div class="ph-field">
            <label class="ph-label">Category *</label>
            <select class="ph-select" [(ngModel)]="form.category" name="category" required>
              <option value="paddy">Paddy</option>
              <option value="import">Import</option>
              <option value="packaging">Packaging</option>
              <option value="equipment">Equipment</option>
              <option value="office">Office</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Origin</label>
            <input class="ph-input" [(ngModel)]="form.origin" name="origin" placeholder="Local, Thailand…" />
          </div>
          <div class="ph-field">
            <label class="ph-label">TIN</label>
            <input class="ph-input" [(ngModel)]="form.tin" name="tin" placeholder="e.g. 123-456-789-000" />
          </div>
          <div class="ph-field">
            <label class="ph-label">EWT Rate %</label>
            <input class="ph-input" type="number" min="0" step="0.5"
                   [(ngModel)]="form.ewt_rate" name="ewt"
                   [disabled]="form.bir_registered" />
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
          <div class="ph-field">
            <label class="ph-label">Email</label>
            <input class="ph-input" type="email" [(ngModel)]="form.email" name="email" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create supplier' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }

    /* KPI cards (compact, mockup-style) */
    .kc {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 20px;
      position: relative; overflow: hidden;
    }
    .kc::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0;
      height: 2px;
    }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }

    .mb { margin-bottom: 20px; }

    /* Pills + status badges */
    .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pg { background: var(--jade-bg);   color: var(--jade); }
    .pb { background: var(--sky-bg);    color: var(--sky); }
    .pa { background: var(--amber-bg);  color: var(--amber); }
    .pv { background: var(--violet-bg); color: var(--violet); }
    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .s-bir   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-nobir { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }

    /* Empty state */
    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    /* Form grid */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .form-grid .col-2 { grid-column: span 2; }
    .form-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 18px; padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    @media (max-width: 720px) {
      .form-grid { grid-template-columns: 1fr 1fr; }
      .form-grid .col-2 { grid-column: span 2; }
    }
  `,
})
export class Suppliers {
  auth = inject(AuthService);

  rows = signal<Supplier[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = { ...EMPTY_FORM };

  kpis = computed(() => {
    const r = this.rows();
    return {
      active: r.filter(x => x.status === 'active').length,
      bir: r.filter(x => x.bir_registered).length,
      nonBir: r.filter(x => !x.bir_registered).length,
      foreign: r.filter(x => x.origin && !/^(local|ph|philippines)$/i.test(x.origin)).length,
    };
  });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('milling_suppliers')
      .select('*')
      .order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Supplier[]);
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
      ewt_rate: this.form.bir_registered ? 0 : (Number(this.form.ewt_rate) || 1),
      tin: this.form.tin || null,
      origin: this.form.origin || null,
      payment_terms: this.form.payment_terms || null,
      contact_person: this.form.contact_person || null,
      phone: this.form.phone || null,
      email: this.form.email || null,
    };
    const { error } = await supabase.from('milling_suppliers').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  peso(n: number) {
    return '₱' + Math.round(n).toLocaleString();
  }
  categoryLabel(c: Supplier['category']) {
    return c === 'paddy' ? 'Paddy'
         : c === 'import' ? 'Import'
         : c === 'packaging' ? 'Packaging'
         : c === 'equipment' ? 'Equipment'
         : 'Office';
  }
  categoryPillClass(c: Supplier['category']) {
    return c === 'paddy' ? 'pg'
         : c === 'import' ? 'pb'
         : c === 'packaging' ? 'pa'
         : c === 'equipment' ? 'pv'
         : 'pa';
  }
}
