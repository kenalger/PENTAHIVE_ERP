import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface Canvass {
  id: string;
  no: string;
  date: string;
  pr_no: string | null;
  currency: string;
  vat_treatment: 'vat-inclusive' | 'vat-exclusive' | 'vat-exempt';
  status: 'open' | 'awaiting_approval' | 'awarded' | 'closed' | 'cancelled';
  created_at: string;
}

interface PROption { id: string; no: string; }

const EMPTY_FORM = () => ({
  pr_id: '' as string,
  pr_no: '' as string | null,
  currency: 'PHP',
  vat_treatment: 'vat-inclusive' as Canvass['vat_treatment'],
});

@Component({
  selector: 'app-canvasses',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-a"><span class="kc-ico">📋</span><div class="kc-lbl">Open</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">In progress</div></div>
      <div class="kc kc-b"><span class="kc-ico">🛎️</span><div class="kc-lbl">Awaiting Approval</div><div class="kc-val">{{ kpis().awaiting }}</div><div class="kc-sub">Pending review</div></div>
      <div class="kc kc-g"><span class="kc-ico">🏆</span><div class="kc-lbl">Awarded</div><div class="kc-val">{{ kpis().awarded }}</div><div class="kc-sub">Resulted in POs</div></div>
      <div class="kc kc-r"><span class="kc-ico">❌</span><div class="kc-lbl">Closed/Cancelled</div><div class="kc-val">{{ kpis().closed }}</div><div class="kc-sub">Inactive</div></div>
    </div>

    <div class="ph-alert ph-alert-info" style="margin-bottom:14px">
      <strong>Quote entry &amp; winner picking</strong> are deferred to a follow-up release.
      For now, create the canvass header here and use <em>Purchase Orders → Direct PO</em>
      to issue the order. The full PR → Canvass → PO automation arrives with the procurement workflow update.
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Canvass Register</div>
        @if (auth.canDo('canvasses','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Canvass</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">📋</div>
          <div class="title">No canvasses yet</div>
          <div class="hint">Create a PR first, then start a canvass from it.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>Canvass No.</th><th>Date</th><th>PR Ref</th><th>Currency</th><th>VAT</th><th>Status</th></tr></thead>
            <tbody>
              @for (c of rows(); track c.id) {
                <tr>
                  <td class="mono ta">{{ c.no }}</td>
                  <td class="sub mono">{{ c.date }}</td>
                  <td class="mono tb">{{ c.pr_no || '—' }}</td>
                  <td class="mono">{{ c.currency }}</td>
                  <td class="sub">{{ c.vat_treatment.replace('-', ' ') }}</td>
                  <td><span [class]="badgeClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Canvass'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Source PR</label>
            <select class="ph-select" [(ngModel)]="form.pr_id" name="pr" (change)="onPrChange()">
              <option value="">— None (free-form canvass) —</option>
              @for (p of prOptions(); track p.id) {
                <option [value]="p.id">{{ p.no }}</option>
              }
            </select>
            <span class="help">Only PRs in <em>for_canvass</em> status are listed.</span>
          </div>

          <div class="ph-field">
            <label class="ph-label">Currency</label>
            <select class="ph-select" [(ngModel)]="form.currency" name="currency">
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
              <option value="THB">THB</option>
              <option value="VND">VND</option>
            </select>
          </div>

          <div class="ph-field col-3">
            <label class="ph-label">VAT Treatment</label>
            <select class="ph-select" [(ngModel)]="form.vat_treatment" name="vat">
              <option value="vat-inclusive">VAT Inclusive</option>
              <option value="vat-exclusive">VAT Exclusive</option>
              <option value="vat-exempt">VAT Exempt</option>
            </select>
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create canvass' }}
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
    .form-grid .col-3 { grid-column: span 3; }
    .help { font-size: 10.5px; color: var(--dim); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-open    { background: var(--gold-bg);  color: var(--gold);  border: 1px solid var(--gold-rim); }
    .s-await   { background: var(--sky-bg);   color: var(--sky);   border: 1px solid var(--sky-rim); }
    .s-award   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-closed  { background: var(--raised);  color: var(--sub); }
    .s-can     { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class Canvasses {
  auth = inject(AuthService);
  rows = signal<Canvass[]>([]);
  prOptions = signal<PROption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  kpis = computed(() => {
    const r = this.rows();
    return {
      open: r.filter(x => x.status === 'open').length,
      awaiting: r.filter(x => x.status === 'awaiting_approval').length,
      awarded: r.filter(x => x.status === 'awarded').length,
      closed: r.filter(x => x.status === 'closed' || x.status === 'cancelled').length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [c, prs] = await Promise.all([
      supabase.from('canvasses').select('id, no, date, pr_no, currency, vat_treatment, status, created_at').order('created_at', { ascending: false }),
      supabase.from('purchase_requests').select('id, no').eq('status', 'for_canvass').order('created_at', { ascending: false }),
    ]);
    this.loading.set(false);
    if (c.error) { this.error.set(c.error.message); return; }
    this.rows.set((c.data ?? []) as Canvass[]);
    this.prOptions.set((prs.data ?? []) as PROption[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  onPrChange() {
    const pr = this.prOptions().find(p => p.id === this.form.pr_id);
    this.form.pr_no = pr?.no ?? null;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'CNV' });
    if (noErr || !noData) {
      this.formError.set(noErr?.message || 'Failed to generate canvass number');
      this.saving.set(false);
      return;
    }
    const { error } = await supabase.from('canvasses').insert({
      no: noData as string,
      pr_id: this.form.pr_id || null,
      pr_no: this.form.pr_no,
      currency: this.form.currency,
      vat_treatment: this.form.vat_treatment,
    });
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  statusLabel(s: Canvass['status']) {
    return s === 'open' ? 'Open'
         : s === 'awaiting_approval' ? 'Awaiting Approval'
         : s === 'awarded' ? 'Awarded'
         : s === 'closed' ? 'Closed'
         : 'Cancelled';
  }
  badgeClass(s: Canvass['status']) {
    return 'bs ' + (
      s === 'open' ? 's-open' :
      s === 'awaiting_approval' ? 's-await' :
      s === 'awarded' ? 's-award' :
      s === 'closed' ? 's-closed' :
      's-can'
    );
  }
}
