import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Vendo {
  id: string;
  code: string;
  name: string;
  location: string | null;
  type: 'water' | 'snacks' | 'coffee' | 'coin-op' | 'other';
  status: 'active' | 'maintenance' | 'retired';
  notes: string | null;
}

const EMPTY_FORM = {
  code: '', name: '', location: '',
  type: 'water' as Vendo['type'],
  status: 'active' as Vendo['status'],
  notes: '',
};

const TYPE_LABELS: Record<Vendo['type'], string> = {
  water: 'Water', snacks: 'Snacks', coffee: 'Coffee',
  'coin-op': 'Coin-op', other: 'Other',
};

@Component({
  selector: 'app-vendos',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k3">
      <div class="kc kc-b">
        <span class="kc-ico">🥤</span>
        <div class="kc-lbl">Total Machines</div>
        <div class="kc-val">{{ rows().length }}</div>
        <div class="kc-sub">In the network</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">✅</span>
        <div class="kc-lbl">Active</div>
        <div class="kc-val">{{ kpis().active }}</div>
        <div class="kc-sub">Generating income</div>
      </div>
      <div class="kc kc-r">
        <span class="kc-ico">🔧</span>
        <div class="kc-lbl">Needs Attention</div>
        <div class="kc-val">{{ kpis().issues }}</div>
        <div class="kc-sub">Maintenance + retired</div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Vending Machines</div>
        @if (auth.canDo('vendos','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Vendo</button>
        }
      </div>

      @if (loading()) {
        <p class="sub" style="padding:16px 0">Loading…</p>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">{{ error() }}</div>
      } @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">🥤</div>
          <div class="title">No vending machines yet</div>
          <div class="hint">Click <strong>＋ New Vendo</strong> to add one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Location</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              @for (v of rows(); track v.id) {
                <tr>
                  <td class="mono ta">{{ v.code }}</td>
                  <td><b>{{ v.name }}</b></td>
                  <td><span class="pill pa">{{ typeLabel(v.type) }}</span></td>
                  <td class="sub">{{ v.location || '—' }}</td>
                  <td>
                    @if (v.status === 'active') { <span class="bs s-ok"><span class="dot"></span>Active</span> }
                    @else if (v.status === 'maintenance') { <span class="bs s-warn">Maintenance</span> }
                    @else { <span class="bs s-dim">Retired</span> }
                  </td>
                  <td class="sub" style="max-width:280px;white-space:normal;font-size:11.5px">{{ v.notes || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Vending Machine'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="form.code" name="code" required placeholder="e.g. VND-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Name *</label>
            <input class="ph-input" [(ngModel)]="form.name" name="name" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Type *</label>
            <select class="ph-select" [(ngModel)]="form.type" name="type" required>
              <option value="water">Water</option>
              <option value="snacks">Snacks</option>
              <option value="coffee">Coffee</option>
              <option value="coin-op">Coin-op</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Status</label>
            <select class="ph-select" [(ngModel)]="form.status" name="status">
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Location</label>
            <input class="ph-input" [(ngModel)]="form.location" name="location" />
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <textarea class="ph-textarea" rows="2" [(ngModel)]="form.notes" name="notes"></textarea>
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create vendo' }}
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
    .kc-b::after { background: linear-gradient(90deg, var(--sky),  transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pa { background: var(--amber-bg); color: var(--amber); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .bs .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .s-ok   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-dim  { background: var(--raised);  color: var(--sub); }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-grid .col-3 { grid-column: span 3; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
  `,
})
export class Vendos {
  auth = inject(AuthService);

  rows = signal<Vendo[]>([]);
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
      issues: r.filter(x => x.status !== 'active').length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase.from('vendos').select('*').order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as Vendo[]);
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
      location: this.form.location || null,
      notes: this.form.notes || null,
    };
    const { error } = await supabase.from('vendos').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  typeLabel(t: Vendo['type']) { return TYPE_LABELS[t]; }
}
