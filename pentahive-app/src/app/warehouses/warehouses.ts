import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: 'paddy' | 'milled' | 'import' | 'byproduct' | 'equipment' | 'office';
  capacity_mt: number | null;
  location: string | null;
  status: 'active' | 'inactive';
}

const EMPTY_FORM = {
  code: '', name: '',
  type: 'paddy' as Warehouse['type'],
  capacity_mt: 0,
  location: '',
};

const TYPE_LABELS: Record<Warehouse['type'], string> = {
  paddy: 'Paddy', milled: 'Milled Rice', import: 'Import',
  byproduct: 'Byproduct', equipment: 'Equipment', office: 'Office',
};
const TYPE_PILL: Record<Warehouse['type'], string> = {
  paddy: 'pg', milled: 'pg', import: 'pb',
  byproduct: 'pa', equipment: 'pv', office: 'pa',
};

@Component({
  selector: 'app-warehouses',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k3">
      <div class="kc kc-b">
        <span class="kc-ico">🏚️</span>
        <div class="kc-lbl">Total Warehouses</div>
        <div class="kc-val">{{ rows().length }}</div>
        <div class="kc-sub">{{ kpis().active }} active</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">⚖️</span>
        <div class="kc-lbl">Total Capacity</div>
        <div class="kc-val">{{ formatMT(kpis().capacity) }}</div>
        <div class="kc-sub">Metric tons</div>
      </div>
      <div class="kc kc-a">
        <span class="kc-ico">🌾</span>
        <div class="kc-lbl">Storage Types</div>
        <div class="kc-val">{{ kpis().typeCount }}</div>
        <div class="kc-sub">Distinct warehouse types</div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Warehouse Registry</div>
        @if (auth.canDo('warehouses','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Warehouse</button>
        }
      </div>

      @if (loading()) {
        <p class="sub" style="padding:16px 0">Loading…</p>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">{{ error() }}</div>
      } @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">🏚️</div>
          <div class="title">No warehouses yet</div>
          <div class="hint">Click <strong>＋ New Warehouse</strong> to register one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Location</th><th class="tr">Capacity (MT)</th><th>Status</th></tr></thead>
            <tbody>
              @for (w of rows(); track w.id) {
                <tr>
                  <td class="mono ta">{{ w.code }}</td>
                  <td><b>{{ w.name }}</b></td>
                  <td><span class="pill" [class]="typePill(w.type)">{{ typeLabel(w.type) }}</span></td>
                  <td class="sub">{{ w.location || '—' }}</td>
                  <td class="mono tr">{{ w.capacity_mt ? formatMT(w.capacity_mt) : '—' }}</td>
                  <td>
                    @if (w.status === 'active') {
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

    <app-modal [open]="showCreate()" [title]="'New Warehouse'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="form.code" name="code" required placeholder="e.g. WH-A" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Name *</label>
            <input class="ph-input" [(ngModel)]="form.name" name="name" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Type *</label>
            <select class="ph-select" [(ngModel)]="form.type" name="type" required>
              <option value="paddy">Paddy</option>
              <option value="milled">Milled Rice</option>
              <option value="import">Import</option>
              <option value="byproduct">Byproduct</option>
              <option value="equipment">Equipment</option>
              <option value="office">Office</option>
            </select>
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Location</label>
            <input class="ph-input" [(ngModel)]="form.location" name="location" placeholder="City / Address" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Capacity (MT)</label>
            <input class="ph-input" type="number" min="0" step="10" [(ngModel)]="form.capacity_mt" name="capacity" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create warehouse' }}
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
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pg { background: var(--jade-bg); color: var(--jade); }
    .pb { background: var(--sky-bg);  color: var(--sky); }
    .pa { background: var(--amber-bg); color: var(--amber); }
    .pv { background: var(--violet-bg); color: var(--violet); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .bs .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .s-ok  { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-dim { background: var(--raised);  color: var(--sub); }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
  `,
})
export class Warehouses {
  auth = inject(AuthService);

  rows = signal<Warehouse[]>([]);
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
      capacity: r.reduce((s, x) => s + (Number(x.capacity_mt) || 0), 0),
      typeCount: new Set(r.map(x => x.type)).size,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Warehouse[]);
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
      capacity_mt: Number(this.form.capacity_mt) || null,
      location: this.form.location || null,
    };
    const { error } = await supabase.from('warehouses').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  formatMT(n: number) { return n.toLocaleString() + ' MT'; }
  typeLabel(t: Warehouse['type']) { return TYPE_LABELS[t]; }
  typePill(t: Warehouse['type'])  { return TYPE_PILL[t]; }
}
