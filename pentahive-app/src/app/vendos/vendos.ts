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

interface Entry {
  id: string;
  vendo_id: string;
  vendo_name?: string;
  date: string;
  type: 'income' | 'expense';
  category: string | null;
  amount: number;
  notes: string | null;
}

const EMPTY_VENDO = () => ({
  code: '', name: '', location: '',
  type: 'water' as Vendo['type'],
  status: 'active' as Vendo['status'],
  notes: '',
});

const EMPTY_ENTRY = () => ({
  vendo_id: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'income' as Entry['type'],
  category: '',
  amount: 0,
  notes: '',
});

const TYPE_LABELS: Record<Vendo['type'], string> = {
  water: 'Water', snacks: 'Snacks', coffee: 'Coffee',
  'coin-op': 'Coin-op', other: 'Other',
};

@Component({
  selector: 'app-vendos',
  imports: [FormsModule, Modal],
  template: `
    <div class="ptabs">
      <button class="ptab" [class.on]="tab() === 'machines'" (click)="tab.set('machines')">
        <span class="pt-ico">🥤</span> Machines
      </button>
      <button class="ptab" [class.on]="tab() === 'movements'" (click)="tab.set('movements')">
        <span class="pt-ico">💵</span> Cash Movements
      </button>
    </div>

    @if (tab() === 'machines') {
      <!-- MACHINES TAB -->
      <div class="krow k4">
        <div class="kc kc-b"><span class="kc-ico">🥤</span><div class="kc-lbl">Total Machines</div><div class="kc-val">{{ rows().length }}</div><div class="kc-sub">In the network</div></div>
        <div class="kc kc-g"><span class="kc-ico">✅</span><div class="kc-lbl">Active</div><div class="kc-val">{{ vKpis().active }}</div><div class="kc-sub">Generating income</div></div>
        <div class="kc kc-r"><span class="kc-ico">🔧</span><div class="kc-lbl">Needs Attention</div><div class="kc-val">{{ vKpis().issues }}</div><div class="kc-sub">Maintenance + retired</div></div>
        <div class="kc kc-a"><span class="kc-ico">💰</span><div class="kc-lbl">Net Income MTD</div><div class="kc-val" [class.tr2]="mtd().net < 0">{{ peso(mtd().net) }}</div><div class="kc-sub">{{ peso(mtd().income) }} in / {{ peso(mtd().expense) }} out</div></div>
      </div>

      <div class="card mb">
        <div class="card-h">
          <div class="card-t">Vending Machines</div>
          @if (auth.canDo('vendos','create')) {
            <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openVendo()">＋ New Vendo</button>
          }
        </div>

        @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
        @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
        @else if (rows().length === 0) {
          <div class="empty">
            <div class="ico">🥤</div>
            <div class="title">No vending machines yet</div>
            <div class="hint">Click <strong>＋ New Vendo</strong> to add one.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Location</th><th>Status</th><th class="tr">Income MTD</th><th class="tr">Expense MTD</th><th class="tr">Net MTD</th></tr></thead>
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
                    <td class="mono tr tg">{{ peso(perVendoMtd(v.id).income) }}</td>
                    <td class="mono tr tr2">{{ peso(perVendoMtd(v.id).expense) }}</td>
                    <td class="mono tr fw6" [class.tr2]="perVendoMtd(v.id).net < 0" [class.tg]="perVendoMtd(v.id).net > 0">
                      {{ peso(perVendoMtd(v.id).net) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    } @else {
      <!-- MOVEMENTS TAB -->
      <div class="krow k4">
        <div class="kc kc-g"><span class="kc-ico">⬆️</span><div class="kc-lbl">Income MTD</div><div class="kc-val tg">{{ peso(filteredMtd().income) }}</div><div class="kc-sub">{{ filteredMtd().incomeCount }} entries</div></div>
        <div class="kc kc-r"><span class="kc-ico">⬇️</span><div class="kc-lbl">Expenses MTD</div><div class="kc-val tr2">{{ peso(filteredMtd().expense) }}</div><div class="kc-sub">{{ filteredMtd().expenseCount }} entries</div></div>
        <div class="kc kc-a"><span class="kc-ico">💼</span><div class="kc-lbl">Net MTD</div><div class="kc-val" [class.tr2]="filteredMtd().net < 0" [class.tg]="filteredMtd().net >= 0">{{ peso(filteredMtd().net) }}</div><div class="kc-sub">{{ vendoFilter() === 'all' ? 'All machines' : (vendoMap()[vendoFilter()] || 'Filtered') }}</div></div>
        <div class="kc kc-b"><span class="kc-ico">📊</span><div class="kc-lbl">Entries Shown</div><div class="kc-val">{{ filteredEntries().length }}</div><div class="kc-sub">Of {{ entries().length }} total</div></div>
      </div>

      <div class="filter-row">
        <label class="sub" style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;font-weight:600">Filter:</label>
        <select class="ph-select" style="max-width:280px" [(ngModel)]="vendoFilterRaw" (change)="vendoFilter.set(vendoFilterRaw)" name="vfilter">
          <option value="all">All machines</option>
          @for (v of rows(); track v.id) { <option [value]="v.id">{{ v.code }} · {{ v.name }}</option> }
        </select>
        <span class="grow"></span>
        @if (auth.canDo('vendos','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openEntry()">＋ New Entry</button>
        }
      </div>

      <div class="card mb">
        <div class="card-h"><div class="card-t">Cash Movements</div></div>

        @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
        @else if (filteredEntries().length === 0) {
          <div class="empty">
            <div class="ico">💵</div>
            <div class="title">No movements {{ vendoFilter() === 'all' ? 'yet' : 'for this machine' }}</div>
            <div class="hint">Click <strong>＋ New Entry</strong> to log one.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>Date</th><th>Machine</th><th>Type</th><th>Category</th><th class="tr">Amount</th><th>Notes</th></tr></thead>
              <tbody>
                @for (e of filteredEntries(); track e.id) {
                  <tr>
                    <td class="sub mono">{{ e.date }}</td>
                    <td>{{ e.vendo_name || '—' }}</td>
                    <td>
                      @if (e.type === 'income') { <span class="bs s-ok"><span class="dot"></span>Income</span> }
                      @else { <span class="bs s-err"><span class="dot"></span>Expense</span> }
                    </td>
                    <td class="sub">{{ e.category || '—' }}</td>
                    <td class="mono tr fw6" [class.tg]="e.type === 'income'" [class.tr2]="e.type === 'expense'">
                      {{ e.type === 'income' ? '+' : '-' }}{{ peso(e.amount) }}
                    </td>
                    <td class="sub" style="max-width:280px;white-space:normal;font-size:11.5px">{{ e.notes || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- New Vendo modal -->
    <app-modal [open]="showVendo()" [title]="'New Vending Machine'" (closed)="closeVendo()">
      <form (ngSubmit)="saveVendo()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Code *</label>
            <input class="ph-input" [(ngModel)]="vendo.code" name="code" required placeholder="e.g. VND-001" />
          </div>
          <div class="ph-field col-2">
            <label class="ph-label">Name *</label>
            <input class="ph-input" [(ngModel)]="vendo.name" name="name" required />
          </div>
          <div class="ph-field">
            <label class="ph-label">Type *</label>
            <select class="ph-select" [(ngModel)]="vendo.type" name="type" required>
              <option value="water">Water</option>
              <option value="snacks">Snacks</option>
              <option value="coffee">Coffee</option>
              <option value="coin-op">Coin-op</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Status</label>
            <select class="ph-select" [(ngModel)]="vendo.status" name="status">
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Location</label>
            <input class="ph-input" [(ngModel)]="vendo.location" name="location" />
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <textarea class="ph-textarea" rows="2" [(ngModel)]="vendo.notes" name="notes"></textarea>
          </div>
        </div>

        @if (vendoError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ vendoError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeVendo()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create vendo' }}
          </button>
        </div>
      </form>
    </app-modal>

    <!-- New Entry modal -->
    <app-modal [open]="showEntry()" [title]="'New Cash Movement'" (closed)="closeEntry()">
      <form (ngSubmit)="saveEntry()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Machine *</label>
            <select class="ph-select" [(ngModel)]="entry.vendo_id" name="vendo" required>
              <option value="">— Select machine —</option>
              @for (v of rows(); track v.id) { <option [value]="v.id">{{ v.code }} · {{ v.name }}</option> }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Date *</label>
            <input class="ph-input" type="date" [(ngModel)]="entry.date" name="date" required />
          </div>

          <div class="ph-field">
            <label class="ph-label">Type *</label>
            <select class="ph-select" [(ngModel)]="entry.type" name="type" required>
              <option value="income">Income (+)</option>
              <option value="expense">Expense (−)</option>
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Category</label>
            <input class="ph-input" [(ngModel)]="entry.category" name="category" placeholder="e.g. Coin drop / Refill / Repair" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Amount (₱) *</label>
            <input class="ph-input mono" type="number" min="0" step="1" [(ngModel)]="entry.amount" name="amount" required />
          </div>

          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="entry.notes" name="notes" />
          </div>
        </div>

        @if (entryError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ entryError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeEntry()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Log movement' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }

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

    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .pa { background: var(--amber-bg); color: var(--amber); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .bs .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .s-ok   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-err  { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
    .s-warn { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-dim  { background: var(--raised); color: var(--sub); }

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

  tab = signal<'machines' | 'movements'>('machines');
  rows = signal<Vendo[]>([]);
  entries = signal<Entry[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  vendoFilter = signal<string>('all');
  vendoFilterRaw = 'all';

  showVendo = signal(false);
  showEntry = signal(false);
  saving = signal(false);
  vendoError = signal<string | null>(null);
  entryError = signal<string | null>(null);
  vendo = EMPTY_VENDO();
  entry = EMPTY_ENTRY();

  vKpis = computed(() => {
    const r = this.rows();
    return {
      active: r.filter(x => x.status === 'active').length,
      issues: r.filter(x => x.status !== 'active').length,
    };
  });

  vendoMap = computed(() => {
    const m: Record<string, string> = {};
    for (const v of this.rows()) m[v.id] = `${v.code} · ${v.name}`;
    return m;
  });

  // All entries this month, all machines.
  mtd = computed(() => {
    const month = new Date().toISOString().slice(0, 7);
    const eThisMonth = this.entries().filter(e => e.date.startsWith(month));
    return this.aggregate(eThisMonth);
  });

  filteredEntries = computed(() => {
    const f = this.vendoFilter();
    return f === 'all' ? this.entries() : this.entries().filter(e => e.vendo_id === f);
  });

  filteredMtd = computed(() => {
    const month = new Date().toISOString().slice(0, 7);
    const eThisMonth = this.filteredEntries().filter(e => e.date.startsWith(month));
    return this.aggregate(eThisMonth);
  });

  perVendoMtd(vendoId: string) {
    const month = new Date().toISOString().slice(0, 7);
    const e = this.entries().filter(x => x.vendo_id === vendoId && x.date.startsWith(month));
    return this.aggregate(e);
  }

  private aggregate(entries: Entry[]) {
    let income = 0, expense = 0, incomeCount = 0, expenseCount = 0;
    for (const e of entries) {
      const amt = Number(e.amount) || 0;
      if (e.type === 'income') { income += amt; incomeCount++; }
      else { expense += amt; expenseCount++; }
    }
    return { income, expense, net: income - expense, incomeCount, expenseCount };
  }

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [v, e] = await Promise.all([
      supabase.from('vendos').select('*').order('created_at', { ascending: false }),
      supabase.from('vendo_entries')
        .select('id, vendo_id, date, type, category, amount, notes, vendos(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    this.loading.set(false);
    if (v.error) { this.error.set(v.error.message); return; }
    this.rows.set((v.data ?? []) as Vendo[]);
    this.entries.set((e.data ?? []).map((x: any) => ({ ...x, vendo_name: x.vendos?.name })) as Entry[]);
  }

  // Vendo CRUD
  openVendo() { this.vendo = EMPTY_VENDO(); this.vendoError.set(null); this.showVendo.set(true); }
  closeVendo() { this.showVendo.set(false); }
  async saveVendo() {
    this.saving.set(true);
    this.vendoError.set(null);
    const payload = {
      ...this.vendo,
      location: this.vendo.location || null,
      notes: this.vendo.notes || null,
    };
    const { error } = await supabase.from('vendos').insert(payload);
    this.saving.set(false);
    if (error) { this.vendoError.set(error.message); return; }
    this.closeVendo();
    await this.load();
  }

  // Entry CRUD
  openEntry() {
    this.entry = EMPTY_ENTRY();
    // Pre-fill machine if filtered to one
    if (this.vendoFilter() !== 'all') this.entry.vendo_id = this.vendoFilter();
    this.entryError.set(null);
    this.showEntry.set(true);
  }
  closeEntry() { this.showEntry.set(false); }
  async saveEntry() {
    this.saving.set(true);
    this.entryError.set(null);
    if (!this.entry.vendo_id) { this.entryError.set('Pick a machine.'); this.saving.set(false); return; }
    if (!this.entry.amount || Number(this.entry.amount) <= 0) {
      this.entryError.set('Amount must be positive.'); this.saving.set(false); return;
    }
    const payload = {
      vendo_id: this.entry.vendo_id,
      date: this.entry.date,
      type: this.entry.type,
      category: this.entry.category || null,
      amount: Number(this.entry.amount),
      notes: this.entry.notes || null,
    };
    const { error } = await supabase.from('vendo_entries').insert(payload);
    this.saving.set(false);
    if (error) { this.entryError.set(error.message); return; }
    this.closeEntry();
    await this.load();
  }

  typeLabel(t: Vendo['type']) { return TYPE_LABELS[t]; }
  peso(n: number) {
    const v = Math.round(Math.abs(n));
    return '₱' + v.toLocaleString();
  }
}
