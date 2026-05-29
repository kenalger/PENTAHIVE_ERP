import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface PR {
  id: string;
  no: string;
  date: string;
  department: string | null;
  purpose: string | null;
  needed_by: string | null;
  status: 'draft' | 'for_canvass' | 'canvassed' | 'approved' | 'converted_to_po' | 'cancelled';
  canvass_no: string | null;
  po_no: string | null;
  total: number;
  created_at: string;
}

interface Line {
  description: string;
  uom: string;
  qty: number;
  est_unit_price: number;
}

const EMPTY_LINE = (): Line => ({ description: '', uom: 'MT', qty: 0, est_unit_price: 0 });
const EMPTY_FORM = () => ({
  department: '', purpose: '', needed_by: '',
  lines: [EMPTY_LINE()],
});

@Component({
  selector: 'app-purchase-requests',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k4">
      <div class="kc kc-a"><span class="kc-ico">📝</span><div class="kc-lbl">Draft / For Canvass</div><div class="kc-val">{{ kpis().pending }}</div><div class="kc-sub">Pending pickup</div></div>
      <div class="kc kc-b"><span class="kc-ico">📋</span><div class="kc-lbl">Canvassing</div><div class="kc-val">{{ kpis().canvassing }}</div><div class="kc-sub">Bids in progress</div></div>
      <div class="kc kc-g"><span class="kc-ico">✅</span><div class="kc-lbl">Converted to PO</div><div class="kc-val">{{ kpis().converted }}</div><div class="kc-sub">Issued this period</div></div>
      <div class="kc kc-r"><span class="kc-ico">⏰</span><div class="kc-lbl">Aged &gt; 7 days</div><div class="kc-val">{{ kpis().aged }}</div><div class="kc-sub">Open + idle &gt; week</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Purchase Requests</div>
        @if (auth.canDo('purchase-requests','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New PR</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">📝</div>
          <div class="title">No purchase requests yet</div>
          <div class="hint">Click <strong>＋ New PR</strong> to draft one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr><th>PR No.</th><th>Date</th><th>Department</th><th>Purpose</th><th>Needed by</th><th class="tr">Total</th><th>Status</th></tr></thead>
            <tbody>
              @for (p of rows(); track p.id) {
                <tr>
                  <td class="mono ta">{{ p.no }}</td>
                  <td class="sub mono">{{ p.date }}</td>
                  <td>{{ p.department || '—' }}</td>
                  <td class="sub" style="max-width:280px;white-space:normal">{{ p.purpose || '—' }}</td>
                  <td class="sub mono">{{ p.needed_by || '—' }}</td>
                  <td class="mono tr">{{ peso(p.total) }}</td>
                  <td>{{ statusBadge(p.status) }}<span [class]="badgeClass(p.status)">{{ statusLabel(p.status) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Purchase Request'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field">
            <label class="ph-label">Department</label>
            <input class="ph-input" [(ngModel)]="form.department" name="department" placeholder="Production, Office, …" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Needed By</label>
            <input class="ph-input" type="date" [(ngModel)]="form.needed_by" name="needed_by" />
          </div>
          <div class="ph-field col-3">
            <label class="ph-label">Purpose</label>
            <input class="ph-input" [(ngModel)]="form.purpose" name="purpose" placeholder="Why is this PR needed?" />
          </div>
        </div>

        <div class="lines">
          <div class="lines-h">
            <span>Line items</span>
            <span class="grow"></span>
            <button type="button" class="ph-btn ph-btn-ghost ph-btn-sm" (click)="addLine()">＋ Add line</button>
          </div>
          <table class="ph-table">
            <thead><tr><th>#</th><th>Description</th><th>UoM</th><th class="tr">Qty</th><th class="tr">Est. Unit ₱</th><th class="tr">Total</th><th></th></tr></thead>
            <tbody>
              @for (l of form.lines; track $index) {
                <tr>
                  <td class="mono dim">{{ $index + 1 }}</td>
                  <td><input class="ph-input" [(ngModel)]="l.description" [name]="'desc' + $index" required /></td>
                  <td><input class="ph-input mono" [(ngModel)]="l.uom" [name]="'uom' + $index" style="width:80px" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.qty" [name]="'qty' + $index" style="width:100px" /></td>
                  <td><input class="ph-input mono tr" type="number" min="0" step="0.01" [(ngModel)]="l.est_unit_price" [name]="'price' + $index" style="width:120px" /></td>
                  <td class="mono tr tg">{{ peso(lineTotal(l)) }}</td>
                  <td>
                    @if (form.lines.length > 1) {
                      <button type="button" class="rm-btn" (click)="removeLine($index)" title="Remove line">×</button>
                    }
                  </td>
                </tr>
              }
              <tr class="sum-row">
                <td colspan="5" class="tr sub">Total</td>
                <td class="mono tr fw7 tg">{{ peso(totalAmount()) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="button" class="ph-btn ph-btn-secondary" (click)="save('draft')" [disabled]="saving()">Save Draft</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Submit for canvass' }}
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

    .lines { margin-top: 18px; }
    .lines-h { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; }
    .grow { flex: 1; }
    .lines .ph-input { padding: 6px 10px; font-size: 12px; }
    .sum-row td { background: var(--raised); }
    .rm-btn { background: none; border: none; color: var(--rose); font-size: 20px; cursor: pointer; line-height: 1; padding: 0; width: 24px; height: 24px; }
    .rm-btn:hover { background: var(--rose-bg); border-radius: var(--r4); }

    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    /* Status badges */
    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .bs .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .s-draft   { background: var(--raised);   color: var(--sub); }
    .s-fc      { background: var(--gold-bg);  color: var(--gold);  border: 1px solid var(--gold-rim); }
    .s-cnv     { background: var(--sky-bg);   color: var(--sky);   border: 1px solid var(--sky-rim); }
    .s-app     { background: var(--jade-bg);  color: var(--jade);  border: 1px solid var(--jade-rim); }
    .s-conv    { background: var(--teal-bg);  color: var(--teal);  border: 1px solid var(--teal-rim); }
    .s-can     { background: var(--rose-bg);  color: var(--rose);  border: 1px solid var(--rose-rim); }
  `,
})
export class PurchaseRequests {
  auth = inject(AuthService);
  rows = signal<PR[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form: ReturnType<typeof EMPTY_FORM> = EMPTY_FORM();

  kpis = computed(() => {
    const r = this.rows();
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;
    return {
      pending: r.filter(x => x.status === 'draft' || x.status === 'for_canvass').length,
      canvassing: r.filter(x => x.status === 'canvassed').length,
      converted: r.filter(x => x.status === 'converted_to_po').length,
      aged: r.filter(x =>
        (x.status === 'draft' || x.status === 'for_canvass' || x.status === 'canvassed')
        && new Date(x.created_at).getTime() < sevenDaysAgo,
      ).length,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('id, no, date, department, purpose, needed_by, status, canvass_no, po_no, total, created_at')
      .order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.rows.set((data ?? []) as PR[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  addLine() { this.form.lines = [...this.form.lines, EMPTY_LINE()]; }
  removeLine(i: number) { this.form.lines = this.form.lines.filter((_, ix) => ix !== i); }

  lineTotal(l: Line) { return (Number(l.qty) || 0) * (Number(l.est_unit_price) || 0); }
  totalAmount() { return this.form.lines.reduce((s, l) => s + this.lineTotal(l), 0); }

  async save(asDraft: 'draft' | true = true) {
    const status: PR['status'] = asDraft === 'draft' ? 'draft' : 'for_canvass';
    this.saving.set(true);
    this.formError.set(null);

    // Filter empty lines
    const lines = this.form.lines.filter(l => l.description && l.qty > 0);
    if (lines.length === 0) {
      this.formError.set('Add at least one line item with a description and qty.');
      this.saving.set(false);
      return;
    }

    // Get document number from DB
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'PR' });
    if (noErr || !noData) {
      this.formError.set(noErr?.message || 'Failed to generate PR number');
      this.saving.set(false);
      return;
    }
    const prNo = noData as string;

    // Insert header
    const { data: prRow, error: prErr } = await supabase
      .from('purchase_requests')
      .insert({
        no: prNo,
        department: this.form.department || null,
        purpose: this.form.purpose || null,
        needed_by: this.form.needed_by || null,
        status,
        total: this.totalAmount(),
        requester_id: this.auth.user()?.id ?? null,
      })
      .select('id')
      .single();

    if (prErr || !prRow) {
      this.formError.set(prErr?.message || 'Failed to create PR');
      this.saving.set(false);
      return;
    }

    // Insert lines
    const linePayloads = lines.map((l, i) => ({
      pr_id: prRow.id,
      line_no: i + 1,
      description: l.description,
      uom: l.uom,
      qty: Number(l.qty),
      est_unit_price: Number(l.est_unit_price) || 0,
    }));
    const { error: linesErr } = await supabase.from('pr_lines').insert(linePayloads);
    if (linesErr) {
      this.formError.set('Header saved but lines failed: ' + linesErr.message);
      this.saving.set(false);
      return;
    }

    this.saving.set(false);
    this.closeCreate();
    await this.load();
  }

  peso(n: number) { return '₱' + Math.round(n).toLocaleString(); }
  statusBadge(_s: PR['status']) { return ''; }
  statusLabel(s: PR['status']) {
    return s === 'draft' ? 'Draft'
         : s === 'for_canvass' ? 'For Canvass'
         : s === 'canvassed' ? 'Canvassed'
         : s === 'approved' ? 'Approved'
         : s === 'converted_to_po' ? 'Converted to PO'
         : 'Cancelled';
  }
  badgeClass(s: PR['status']) {
    return 'bs ' + (
      s === 'draft' ? 's-draft' :
      s === 'for_canvass' ? 's-fc' :
      s === 'canvassed' ? 's-cnv' :
      s === 'approved' ? 's-app' :
      s === 'converted_to_po' ? 's-conv' :
      's-can'
    );
  }
}
