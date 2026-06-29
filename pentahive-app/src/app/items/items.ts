import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Item {
  id: string;
  code: string;
  description: string;
  uom: string;
  category: string;
  last_price: number | null;
  last_canvass_date: string | null;
}

const EMPTY_FORM = {
  code: '', description: '', uom: 'MT',
  category: 'milled-rice',
  last_price: 0,
};

const CATEGORIES = [
  { value: 'paddy',        label: 'Paddy',        pill: 'pg' },
  { value: 'milled-rice',  label: 'Milled Rice',  pill: 'pg' },
  { value: 'import-rice',  label: 'Imported Rice',pill: 'pb' },
  { value: 'packaging',    label: 'Packaging',    pill: 'pa' },
  { value: 'equipment',    label: 'Equipment',    pill: 'pv' },
  { value: 'byproduct',    label: 'Byproduct',    pill: 'pa' },
  { value: 'office',       label: 'Office',       pill: 'pa' },
  { value: 'other',        label: 'Other',        pill: 'pa' },
];

@Component({
  selector: 'app-items',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k3">
      <div class="kc kc-b">
        <span class="kc-ico">🪙</span>
        <div class="kc-lbl">Total Items</div>
        <div class="kc-val">{{ rows().length }}</div>
        <div class="kc-sub">In master catalog</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">🌾</span>
        <div class="kc-lbl">Rice (paddy + milled)</div>
        <div class="kc-val">{{ kpis().rice }}</div>
        <div class="kc-sub">Local stream items</div>
      </div>
      <div class="kc kc-a">
        <span class="kc-ico">📦</span>
        <div class="kc-lbl">Avg Last Price</div>
        <div class="kc-val">{{ peso(kpis().avgPrice) }}</div>
        <div class="kc-sub">Across priced items</div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Item Master</div>
        @if (auth.canDo('items','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Item</button>
        }
      </div>

      @if (loading()) {
        <p class="sub" style="padding:16px 0">Loading…</p>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">{{ error() }}</div>
      } @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">🪙</div>
          <div class="title">No items yet</div>
          <div class="hint">Click <strong>＋ New Item</strong> to add one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead>
              <tr><th>Code</th><th>Description</th><th>Category</th><th>UoM</th><th class="tr">Last Price</th><th>Last Canvass</th></tr>
            </thead>
            <tbody>
              @for (i of rows(); track i.id) {
                <tr>
                  <td class="mono ta">{{ i.code }}</td>
                  <td><b>{{ i.description }}</b></td>
                  <td><span class="pill" [class]="catPill(i.category)">{{ catLabel(i.category) }}</span></td>
                  <td class="mono">{{ i.uom }}</td>
                  <td class="mono tr">{{ i.last_price ? peso(i.last_price) : '—' }}</td>
                  <td class="sub mono">{{ i.last_canvass_date || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Item'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="form.code" name="code" required placeholder="e.g. ITM-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Description *</label>
            <input class="ph-input" [(ngModel)]="form.description" name="description" required />
          </div>

          <div class="ph-field">
            <label class="ph-label">Category *</label>
            <select class="ph-select" [(ngModel)]="form.category" name="category" required>
              @for (c of categories; track c.value) { <option [value]="c.value">{{ c.label }}</option> }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">UoM *</label>
            <input class="ph-input" [(ngModel)]="form.uom" name="uom" required placeholder="MT / bag / pc" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Last Price (₱)</label>
            <input class="ph-input" type="number" min="0" step="1" [(ngModel)]="form.last_price" name="price" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create item' }}
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

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
  `,
})
export class Items {
  auth = inject(AuthService);
  categories = CATEGORIES;

  rows = signal<Item[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = { ...EMPTY_FORM };

  kpis = computed(() => {
    const r = this.rows();
    const priced = r.filter(x => x.last_price != null && x.last_price > 0);
    return {
      rice: r.filter(x => x.category === 'paddy' || x.category === 'milled-rice' || x.category === 'import-rice').length,
      avgPrice: priced.length ? priced.reduce((s, x) => s + (Number(x.last_price) || 0), 0) / priced.length : 0,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('milling_items')
      .select('id, code, description, uom, category, last_price, last_canvass_date')
      .order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Item[]);
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
      last_price: Number(this.form.last_price) || null,
    };
    const { error } = await supabase.from('milling_items').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  catLabel(c: string) { return CATEGORIES.find(x => x.value === c)?.label ?? c; }
  catPill(c: string)  { return CATEGORIES.find(x => x.value === c)?.pill ?? 'pa'; }
}
