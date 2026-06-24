import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

interface CvRow {
  id: string;
  no: string;
  payment_date: string;
  supplier_id: string | null;
  supplier_name: string | null;
  cash_account_id: number;
  cash_account_name: string | null;
  check_no: string | null;
  mode: string;
  amount: number;
  status: string;
}

interface SupplierOption {
  id: string;
  name: string;
  ap_balance: number;
}

interface Apv {
  supplier_invoice_id: string;
  bill_no: string;
  invoice_date: string;
  due_date: string | null;
  net_payable: number;
  applied: number;
  remaining: number;
  derived_status: string;
  // editable, UI-only:
  selected: boolean;
  amount_applied: number;
}

interface CashAccount {
  id: number;
  name: string;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const CASH_ON_HAND = 12;
const CASH_IN_BANK = 11;

const EMPTY_CV_FORM = () => ({
  supplier_id: '' as string,
  supplier_name: '' as string,
  payment_date: todayIso(),
  mode: 'check',
  cash_account_id: CASH_IN_BANK,
  check_no: '',
  paid_from: '',
});

@Component({
  selector: 'app-check-voucher',
  imports: [FormsModule, Modal, Icon],
  template: `
    <div class="krow k3">
      <div class="kc kc-g"><span class="kc-ico">🧾</span><div class="kc-lbl">CVs This Period</div><div class="kc-val">{{ kpis().cvCount }}</div><div class="kc-sub">Posted this month</div></div>
      <div class="kc kc-a"><span class="kc-ico">🏦</span><div class="kc-lbl">Total Disbursed</div><div class="kc-val">{{ fmt(kpis().disbursed) }}</div><div class="kc-sub">Posted CVs, this month</div></div>
      <div class="kc kc-r"><span class="kc-ico">⏳</span><div class="kc-lbl">APVs Awaiting Payment</div><div class="kc-val">{{ kpis().openApvs }}</div><div class="kc-sub">Open / partial bills</div></div>
    </div>

    @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
    @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
    @else {
      <div class="card">
        <div class="card-h">
          <div class="card-t">Check Voucher Register</div>
          <div class="filters">
            <div class="srch">
              <app-icon name="search" [size]="15" />
              <input class="ph-input" [(ngModel)]="search" name="search" placeholder="Search CV / supplier / check…" />
            </div>
            <select class="ph-select" [(ngModel)]="statusFilter" name="status">
              <option value="all">All statuses</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>
            @if (auth.canDo('check-voucher','create')) {
              <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openNew()">
                <app-icon name="plus" [size]="14" /> New Check Voucher
              </button>
            }
          </div>
        </div>
        @if (filtered().length === 0) {
          <div class="empty">
            <div class="ico">🧾</div>
            <div class="title">{{ cvs().length === 0 ? 'No check vouchers yet' : 'No matches' }}</div>
            <div class="hint">{{ cvs().length === 0 ? 'Issue a CV to pay one or more supplier bills.' : 'Adjust your search or status filter.' }}</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table">
              <thead><tr><th>CV No.</th><th>Date</th><th>Supplier</th><th>Cash Account</th><th>Check #</th><th class="tr">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (c of filtered(); track c.id) {
                  <tr>
                    <td class="mono ta">{{ c.no }}</td>
                    <td class="sub mono">{{ c.payment_date }}</td>
                    <td>{{ c.supplier_name || '—' }}</td>
                    <td class="sub">{{ c.cash_account_name || ('#' + c.cash_account_id) }}</td>
                    <td class="mono sub">{{ c.check_no || '—' }}</td>
                    <td class="mono tr tb">{{ fmt(c.amount) }}</td>
                    <td><span [class]="statusClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                    <td class="tr">
                      @if (c.status === 'posted' && (auth.canDo('check-voucher','delete') || auth.canDo('check-voucher','edit'))) {
                        <button class="ph-btn ph-btn-sm" (click)="confirmVoid(c)">Void</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- New Check Voucher -->
    <app-modal [open]="showNew()" [title]="'New Check Voucher'" (closed)="closeNew()">
      <div class="form-grid">
        <div class="ph-field">
          <label class="ph-label">Supplier (Payee) *</label>
          <select class="ph-select" [(ngModel)]="cvForm.supplier_id" name="supplier" (ngModelChange)="onSupplierChange()">
            <option value="">Select supplier…</option>
            @for (s of suppliers(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
        </div>
        <div class="ph-field">
          <label class="ph-label">Payment Date *</label>
          <input class="ph-input" type="date" [(ngModel)]="cvForm.payment_date" name="paydate" required />
        </div>
        <div class="ph-field">
          <label class="ph-label">Mode</label>
          <select class="ph-select" [(ngModel)]="cvForm.mode" name="mode" (ngModelChange)="onModeChange()">
            <option value="check">Check</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="gcash">GCash</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div class="ph-field">
          <label class="ph-label">Cash Account *</label>
          <select class="ph-select" [(ngModel)]="cvForm.cash_account_id" name="cashacct" required>
            @for (a of cashAccounts(); track a.id) {
              <option [ngValue]="a.id">{{ a.name }}</option>
            }
          </select>
          <span class="fld-hint">
            @if (isDefaultCashAccount()) {
              Default for {{ cvForm.mode === 'cash' ? 'cash' : 'this mode' }} — override if needed.
            } @else {
              <span class="hint-overr"><app-icon name="info" [size]="11" /> Overridden from the {{ cvForm.mode === 'cash' ? 'Cash on Hand' : 'Cash in Bank' }} default.</span>
            }
          </span>
        </div>
        @if (cvForm.mode === 'check') {
          <div class="ph-field">
            <label class="ph-label">Check No.</label>
            <input class="ph-input mono" [(ngModel)]="cvForm.check_no" name="checkno" />
          </div>
        }
        <div class="ph-field">
          <label class="ph-label">Memo (Paid From)</label>
          <input class="ph-input" [(ngModel)]="cvForm.paid_from" name="paidfrom" placeholder="e.g. BPI Main — descriptive only" />
        </div>
      </div>

      @if (loadingApvs()) { <p class="sub" style="padding:12px 0">Loading open bills…</p> }
      @else if (cvForm.supplier_id && apvs().length === 0) {
        <div class="empty" style="padding:24px 12px">
          <div class="ico">✅</div>
          <div class="title">No open bills</div>
          <div class="hint">This supplier has no open or partial APVs to pay.</div>
        </div>
      }
      @else if (apvs().length > 0) {
        <div class="lines">
          <div class="lines-h">
            <span>Open / partial bills — tick to pay, edit amount applied (≤ remaining)</span>
            <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm"
                    (click)="toggleAll(!allSelected())">
              {{ allSelected() ? 'Clear all' : 'Select all' }}
            </button>
          </div>
          <div class="tw">
            <table class="ph-table apv-table">
              <thead>
                <tr>
                  <th class="tc" style="width:36px">
                    <input type="checkbox" class="sel-all"
                           [checked]="allSelected()"
                           [indeterminate]="someSelected()"
                           (change)="toggleAll($any($event.target).checked)"
                           aria-label="Select all open bills" />
                  </th>
                  <th>Bill No.</th><th>Due Date</th><th>Status</th>
                  <th class="tr">Net Payable</th><th class="tr">Applied</th><th class="tr">Remaining</th>
                  <th class="tr">Amount to Pay</th>
                  <th style="width:74px"></th>
                </tr>
              </thead>
              <tbody>
                @for (a of apvs(); track a.supplier_invoice_id) {
                  <tr [class.row-on]="a.selected">
                    <td class="tc">
                      <input type="checkbox" [(ngModel)]="a.selected" [name]="'sel_' + a.supplier_invoice_id"
                             (ngModelChange)="onToggle(a)" [attr.aria-label]="'Pay bill ' + a.bill_no" />
                    </td>
                    <td class="mono ta">{{ a.bill_no }}</td>
                    <td class="mono" [class.overdue]="isOverdue(a)">
                      {{ a.due_date || '—' }}
                      @if (isOverdue(a)) { <span class="od-flag" title="Past due">Overdue</span> }
                    </td>
                    <td><span [class]="apvStatusClass(a.derived_status)">{{ apvStatusLabel(a.derived_status) }}</span></td>
                    <td class="mono tr sub">{{ fmt(a.net_payable) }}</td>
                    <td class="mono tr sub">{{ a.applied > 0 ? fmt(a.applied) : '—' }}</td>
                    <td class="mono tr tb fw7">{{ fmt(a.remaining) }}</td>
                    <td class="tr">
                      <input class="ph-input mono tr amt" type="number" min="0" step="0.01"
                             [class.amt-over]="a.selected && overRemaining(a)"
                             [max]="a.remaining"
                             [(ngModel)]="a.amount_applied" [name]="'amt_' + a.supplier_invoice_id"
                             [disabled]="!a.selected"
                             [attr.aria-invalid]="a.selected && overRemaining(a)" />
                      @if (a.selected && overRemaining(a)) {
                        <div class="amt-warn">Exceeds remaining {{ fmt(a.remaining) }}</div>
                      }
                    </td>
                    <td class="tr">
                      @if (!a.selected || a.amount_applied !== a.remaining) {
                        <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm pif" (click)="payInFull(a)"
                                [attr.aria-label]="'Pay ' + a.bill_no + ' in full'">Pay full</button>
                      } @else {
                        <span class="pif-done"><app-icon name="check" [size]="12" /> Full</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Prominent running summary — what the check will total, live -->
          <div class="cv-summary" [class.summary-bad]="hasOverRemaining()">
            <div class="sum-left">
              <span class="sum-count">{{ selectedCount() }}</span>
              <span class="sum-count-lbl">{{ selectedCount() === 1 ? 'bill selected' : 'bills selected' }}</span>
            </div>
            <div class="sum-right">
              <div class="sum-lbl">Check Total</div>
              <div class="sum-val mono">{{ fmt(checkTotal()) }}</div>
            </div>
          </div>

          @if (canPost()) {
            <div class="cv-preview">
              <app-icon name="info" [size]="13" />
              This check pays <strong>{{ selectedCount() }}</strong> {{ selectedCount() === 1 ? 'bill' : 'bills' }},
              totaling <strong class="mono">{{ fmt(checkTotal()) }}</strong> from <strong>{{ cashAccountName() }}</strong>.
            </div>
          }
        </div>
      }

      @if (postError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ postError() }}</div> }

      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeNew()">Cancel</button>
        <button type="button" class="ph-btn ph-btn-primary"
                [disabled]="posting() || !canPost()"
                (click)="postCv()">
          {{ posting() ? 'Posting…' : 'Post CV' }}
        </button>
      </div>
    </app-modal>

    <!-- Void confirm -->
    <app-modal [open]="showVoid()" [title]="'Void Check Voucher'" (closed)="closeVoid()">
      @if (voidTarget(); as v) {
        <p class="sub" style="margin-bottom:14px">
          Void <strong class="mono">{{ v.no }}</strong> ({{ fmt(v.amount) }} to {{ v.supplier_name }})?
          This posts a reversing journal entry, restores the supplier balance, and reopens the paid bills.
        </p>
      }
      @if (voidError()) { <div class="ph-alert ph-alert-error" style="margin-bottom:12px">{{ voidError() }}</div> }
      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeVoid()">Cancel</button>
        <button type="button" class="ph-btn ph-btn-danger" [disabled]="voiding()" (click)="doVoid()">
          {{ voiding() ? 'Voiding…' : 'Void CV' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .kc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 20px; position: relative; overflow: hidden; }
    .kc::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kc-g::after { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-a::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-r::after { background: linear-gradient(90deg, var(--rose), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 24px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }

    .filters { display: flex; align-items: center; gap: 10px; }
    .srch { display: flex; align-items: center; gap: 8px; }
    .srch app-icon { color: var(--sub); }
    .srch .ph-input { min-width: 220px; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .fld-hint { font-size: 10.5px; color: var(--dim); line-height: 1.4; }
    .fld-hint .hint-overr { display: inline-flex; align-items: center; gap: 4px; color: var(--amber); }

    .lines { margin-top: 18px; }
    .lines-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
    .lines-h .ph-btn { text-transform: none; letter-spacing: 0; }
    .apv-table .tc { text-align: center; }
    .apv-table input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--gold); }
    .apv-table td { vertical-align: top; }
    .apv-table .amt { width: 130px; }
    .apv-table .amt.amt-over { border-color: var(--rose); box-shadow: 0 0 0 3px var(--rose-bg); }
    .apv-table .amt-warn { font-size: 10px; color: var(--rose); font-weight: 700; margin-top: 4px; text-align: right; }
    .apv-table tr.row-on { background: var(--gold-bg); }
    .apv-table td.overdue { color: var(--rose); }
    .od-flag { display: inline-block; margin-left: 6px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--rose); background: var(--rose-bg); border-radius: 4px; padding: 1px 5px; vertical-align: middle; }
    .pif { text-transform: none; letter-spacing: 0; padding: 3px 8px; }
    .pif-done { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: var(--jade); }

    .cv-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 16px; padding: 14px 18px; border: 1px solid var(--gold-rim); border-radius: var(--r12); background: linear-gradient(180deg, var(--gold-bg), transparent); }
    .cv-summary.summary-bad { border-color: var(--rose-rim); background: linear-gradient(180deg, var(--rose-bg), transparent); }
    .sum-left { display: flex; align-items: baseline; gap: 8px; }
    .sum-count { font-size: 26px; font-weight: 800; font-family: var(--mono); color: var(--text); line-height: 1; }
    .sum-count-lbl { font-size: 12px; color: var(--sub); }
    .sum-right { text-align: right; }
    .sum-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--sub); margin-bottom: 3px; }
    .sum-val { font-size: 26px; font-weight: 800; color: var(--text); letter-spacing: -1px; line-height: 1; }
    .cv-preview { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--sub); background: var(--sky-bg); border: 1px solid var(--sky-rim); border-radius: var(--r8); padding: 9px 12px; }
    .cv-preview app-icon { color: var(--sky); flex-shrink: 0; }
    .cv-preview strong { color: var(--text); }

    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; text-transform: capitalize; }
    .s-ok { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-warn { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--gold-rim); }
    .s-info { background: var(--sky-bg); color: var(--sky); border: 1px solid var(--sky-rim); }
    .s-mut { background: var(--raised); color: var(--sub); border: 1px solid var(--border); }

    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
  `,
})
export class CheckVoucher {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);

  cvs = signal<CvRow[]>([]);
  suppliers = signal<SupplierOption[]>([]);
  cashAccounts = signal<CashAccount[]>([]);
  openApvCount = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  readonly today = todayIso();
  search = '';
  statusFilter: 'all' | 'posted' | 'cancelled' = 'all';

  // New CV modal
  showNew = signal(false);
  loadingApvs = signal(false);
  posting = signal(false);
  postError = signal<string | null>(null);
  apvs = signal<Apv[]>([]);
  cvForm = EMPTY_CV_FORM();

  // Void modal
  showVoid = signal(false);
  voiding = signal(false);
  voidError = signal<string | null>(null);
  voidTarget = signal<CvRow | null>(null);

  kpis = computed(() => {
    const month = todayIso().slice(0, 7);
    const posted = this.cvs().filter(c => c.status === 'posted');
    const thisMonth = posted.filter(c => c.payment_date.startsWith(month));
    return {
      cvCount: thisMonth.length,
      disbursed: thisMonth.reduce((s, c) => s + Number(c.amount), 0),
      openApvs: this.openApvCount(),
    };
  });

  constructor() {
    this.load();
  }

  fmt(n: number) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // search/statusFilter are plain [(ngModel)] fields; recompute in a method (not
  // computed()) so the list tracks edits live in this zoneless app.
  filtered() {
    const q = this.search.trim().toLowerCase();
    return this.cvs().filter(c => {
      if (this.statusFilter !== 'all' && c.status !== this.statusFilter) return false;
      if (!q) return true;
      return [c.no, c.supplier_name, c.check_no].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }

  // Running totals over the plain apvs() array's UI-only fields — methods, not
  // computed(): they read amount_applied / selected which mutate via [(ngModel)].
  selectedApvs() { return this.apvs().filter(a => a.selected); }
  selectedCount() { return this.selectedApvs().length; }
  checkTotal() { return this.selectedApvs().reduce((s, a) => s + Number(a.amount_applied || 0), 0); }

  // Per-row over-remaining check — drives the inline warn state. Method, not
  // computed(): reads amount_applied which mutates via [(ngModel)].
  overRemaining(a: Apv) { return Number(a.amount_applied) > Number(a.remaining) + 1e-6; }
  hasOverRemaining() { return this.selectedApvs().some(a => this.overRemaining(a)); }

  // Overdue = due_date strictly before today (string compare, ISO dates sort).
  isOverdue(a: Apv) { return !!a.due_date && a.due_date < this.today; }

  // Select-all tri-state over the plain apvs() array.
  allSelected() { const r = this.apvs(); return r.length > 0 && r.every(a => a.selected); }
  someSelected() { const r = this.apvs(); return r.some(a => a.selected) && !this.allSelected(); }
  toggleAll(on: boolean) {
    for (const a of this.apvs()) {
      a.selected = on;
      if (on && (!a.amount_applied || a.amount_applied <= 0)) a.amount_applied = a.remaining;
    }
  }
  // Per-row "pay in full": select + reset amount to the full remaining.
  payInFull(a: Apv) { a.selected = true; a.amount_applied = a.remaining; }

  cashAccountName() {
    const a = this.cashAccounts().find(c => c.id === Number(this.cvForm.cash_account_id));
    return a?.name ?? ('Account #' + this.cvForm.cash_account_id);
  }
  isDefaultCashAccount() {
    const def = this.cvForm.mode === 'cash' ? CASH_ON_HAND : CASH_IN_BANK;
    return Number(this.cvForm.cash_account_id) === def;
  }

  canPost() {
    const sel = this.selectedApvs();
    if (sel.length === 0) return false;
    if (!this.cvForm.supplier_id || !this.cvForm.cash_account_id) return false;
    // every selected amount must be > 0 and ≤ its remaining
    return sel.every(a => Number(a.amount_applied) > 0 && Number(a.amount_applied) <= Number(a.remaining) + 1e-6);
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);

    const [cvRes, supRes, apvCountRes] = await Promise.all([
      supabase.from('supplier_payments')
        .select('id, no, payment_date, supplier_id, cash_account_id, check_no, mode, amount, status, suppliers(name), acc_titles(acc_name)')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers')
        .select('id, name, ap_balance')
        .eq('status', 'active')
        .order('name'),
      supabase.from('gl_settings').select('cash_account_ids').eq('id', 1).single(),
    ]);

    if (cvRes.error) { this.error.set(cvRes.error.message); this.loading.set(false); return; }

    this.cvs.set((cvRes.data ?? []).map((c: any) => ({
      id: c.id, no: c.no, payment_date: c.payment_date,
      supplier_id: c.supplier_id, supplier_name: c.suppliers?.name ?? null,
      cash_account_id: c.cash_account_id, cash_account_name: c.acc_titles?.acc_name ?? null,
      check_no: c.check_no, mode: c.mode, amount: Number(c.amount), status: c.status,
    })));

    this.suppliers.set((supRes.data ?? []).map((s: any) => ({
      id: s.id, name: s.name, ap_balance: Number(s.ap_balance),
    })));

    // Cash account options come from gl_settings.cash_account_ids; resolve names.
    const ids: number[] = (apvCountRes.data?.cash_account_ids ?? [CASH_ON_HAND, CASH_IN_BANK]) as number[];
    const { data: acctData } = await supabase.from('acc_titles')
      .select('id, acc_name').in('id', ids);
    const nameById = new Map((acctData ?? []).map((a: any) => [a.id, a.acc_name]));
    this.cashAccounts.set(ids.map(id => ({ id, name: nameById.get(id) ?? ('Account #' + id) })));

    // Open/partial APV count for the KPI (read-only count via the AP-gated table;
    // a check-voucher user reads remaining through rpc_open_apvs per supplier).
    const { count } = await supabase.from('supplier_invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'partial']);
    this.openApvCount.set(count ?? 0);

    this.loading.set(false);

    // Deep link from AP: ?supplier=<id> preselects and opens the New CV flow.
    const presel = this.route.snapshot.queryParamMap.get('supplier');
    if (presel && this.auth.canDo('check-voucher', 'create')) {
      this.openNew();
      this.cvForm.supplier_id = presel;
      await this.onSupplierChange();
    }
    this.cdr.markForCheck();
  }

  openNew() {
    this.cvForm = EMPTY_CV_FORM();
    this.apvs.set([]);
    this.postError.set(null);
    this.showNew.set(true);
  }

  closeNew() { this.showNew.set(false); }

  onModeChange() {
    // Default cash account follows mode; cash → Cash on Hand, else Cash in Bank.
    this.cvForm.cash_account_id = this.cvForm.mode === 'cash' ? CASH_ON_HAND : CASH_IN_BANK;
  }

  async onSupplierChange() {
    this.apvs.set([]);
    this.postError.set(null);
    const supplier = this.suppliers().find(s => s.id === this.cvForm.supplier_id);
    this.cvForm.supplier_name = supplier?.name ?? '';
    if (!this.cvForm.supplier_id) { this.cdr.markForCheck(); return; }

    this.loadingApvs.set(true);
    const { data, error } = await supabase.rpc('rpc_open_apvs', { p_supplier_id: this.cvForm.supplier_id });
    this.loadingApvs.set(false);

    if (error) { this.postError.set(error.message); this.cdr.markForCheck(); return; }

    this.apvs.set((data ?? []).map((a: any) => ({
      supplier_invoice_id: a.supplier_invoice_id,
      bill_no: a.bill_no,
      invoice_date: a.invoice_date,
      due_date: a.due_date,
      net_payable: Number(a.net_payable),
      applied: Number(a.applied),
      remaining: Number(a.remaining),
      derived_status: a.derived_status,
      selected: false,
      amount_applied: Number(a.remaining),
    })));
    this.cdr.markForCheck();
  }

  onToggle(a: Apv) {
    // Default the amount to the full remaining when first ticked.
    if (a.selected && (!a.amount_applied || a.amount_applied <= 0)) {
      a.amount_applied = a.remaining;
    }
  }

  async postCv() {
    this.posting.set(true);
    this.postError.set(null);

    const sel = this.selectedApvs();
    if (sel.length === 0) { this.postError.set('Select at least one bill to pay.'); this.posting.set(false); return; }
    const bad = sel.find(a => Number(a.amount_applied) > Number(a.remaining) + 1e-6);
    if (bad) { this.postError.set(`Amount on ${bad.bill_no} exceeds its remaining balance.`); this.posting.set(false); return; }

    const header = {
      supplier_id: this.cvForm.supplier_id,
      cash_account_id: this.cvForm.cash_account_id,
      payment_date: this.cvForm.payment_date,
      mode: this.cvForm.mode,
      check_no: this.cvForm.mode === 'check' ? (this.cvForm.check_no || null) : null,
      paid_from: this.cvForm.paid_from || null,
    };
    const allocations = sel.map((a, i) => ({
      supplier_invoice_id: a.supplier_invoice_id,
      amount_applied: Number(a.amount_applied),
      line_no: i + 1,
    }));

    const { error } = await supabase.rpc('rpc_post_cv', { p_header: header, p_allocations: allocations });
    if (error) { this.postError.set(error.message); this.posting.set(false); this.cdr.markForCheck(); return; }

    this.posting.set(false);
    this.closeNew();
    await this.load();
  }

  confirmVoid(c: CvRow) {
    this.voidTarget.set(c);
    this.voidError.set(null);
    this.showVoid.set(true);
  }

  closeVoid() { this.showVoid.set(false); }

  async doVoid() {
    const target = this.voidTarget();
    if (!target) return;
    this.voiding.set(true);
    this.voidError.set(null);

    const { error } = await supabase.rpc('rpc_void_cv', { p_payment_id: target.id });
    if (error) { this.voidError.set(error.message); this.voiding.set(false); this.cdr.markForCheck(); return; }

    this.voiding.set(false);
    this.closeVoid();
    await this.load();
  }

  statusClass(s: string) { return 'bs ' + (s === 'posted' ? 's-ok' : 's-mut'); }
  statusLabel(s: string) { return s === 'posted' ? 'Posted' : 'Cancelled'; }

  apvStatusClass(s: string) {
    switch (s) {
      case 'partial': return 'bs s-warn';
      case 'paid':    return 'bs s-ok';
      case 'open':    return 'bs s-info';
      default:        return 'bs s-mut';
    }
  }
  apvStatusLabel(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }
}
