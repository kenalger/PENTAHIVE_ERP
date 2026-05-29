import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';

interface QC {
  id: string;
  qc_no: string;
  grn_id: string | null;
  grn_no: string | null;
  supplier_name: string | null;
  grade: string | null;
  moisture_pct: number | null;
  impurity_pct: number | null;
  chalkiness_pct: number | null;
  broken_pct: number | null;
  inspector: string | null;
  result: 'passed' | 'partial_reject' | 'rejected';
  notes: string | null;
  inspected_at: string;
}

interface GRNOption { id: string; no: string; supplier_name: string | null; }

const EMPTY_FORM = () => ({
  grn_id: '',
  grn_no: null as string | null,
  supplier_name: null as string | null,
  grade: '',
  moisture_pct: null as number | null,
  impurity_pct: null as number | null,
  chalkiness_pct: null as number | null,
  broken_pct: null as number | null,
  inspector: '',
  result: 'passed' as QC['result'],
  notes: '',
});

@Component({
  selector: 'app-quality-inspection',
  imports: [FormsModule, Modal],
  template: `
    <div class="krow k3">
      <div class="kc kc-g"><span class="kc-ico">🔬</span><div class="kc-lbl">Pass Rate</div><div class="kc-val">{{ kpis().passRate }}%</div><div class="kc-sub">{{ kpis().passed }} of {{ rows().length }} lots</div></div>
      <div class="kc kc-r"><span class="kc-ico">🚫</span><div class="kc-lbl">Rejections</div><div class="kc-val">{{ kpis().rejects }}</div><div class="kc-sub">Partial + full rejects</div></div>
      <div class="kc kc-a"><span class="kc-ico">💧</span><div class="kc-lbl">Avg Moisture</div><div class="kc-val">{{ kpis().avgMoisture }}%</div><div class="kc-sub">Target ≤ 14%</div></div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Quality Inspections</div>
        @if (auth.canDo('quality-inspection','create')) {
          <button class="ph-btn ph-btn-primary ph-btn-sm" (click)="openCreate()">＋ New Inspection</button>
        }
      </div>

      @if (loading()) { <p class="sub" style="padding:16px 0">Loading…</p> }
      @else if (error()) { <div class="ph-alert ph-alert-error">{{ error() }}</div> }
      @else if (rows().length === 0) {
        <div class="empty">
          <div class="ico">🔬</div>
          <div class="title">No inspections yet</div>
          <div class="hint">Click <strong>＋ New Inspection</strong> to log one.</div>
        </div>
      } @else {
        <div class="tw">
          <table class="ph-table">
            <thead><tr>
              <th>QC Ref</th><th>GRN Ref</th><th>Supplier</th><th>Grade</th>
              <th class="tr">Moisture %</th><th class="tr">Impurity %</th>
              <th class="tr">Chalk %</th><th class="tr">Broken %</th>
              <th>Inspector</th><th>Result</th>
            </tr></thead>
            <tbody>
              @for (q of rows(); track q.id) {
                <tr>
                  <td class="mono ta">{{ q.qc_no }}</td>
                  <td class="mono sub">{{ q.grn_no || '—' }}</td>
                  <td>{{ q.supplier_name || '—' }}</td>
                  <td class="sub">{{ q.grade || '—' }}</td>
                  <td class="mono tr" [class.tr2]="moistureBad(q.moisture_pct)" [class.tg]="!moistureBad(q.moisture_pct) && q.moisture_pct !== null">
                    {{ q.moisture_pct !== null ? q.moisture_pct + '%' : '—' }}
                  </td>
                  <td class="mono tr" [class.tr2]="impurityBad(q.impurity_pct)" [class.tg]="!impurityBad(q.impurity_pct) && q.impurity_pct !== null">
                    {{ q.impurity_pct !== null ? q.impurity_pct + '%' : '—' }}
                  </td>
                  <td class="mono tr">{{ q.chalkiness_pct !== null ? q.chalkiness_pct + '%' : '—' }}</td>
                  <td class="mono tr">{{ q.broken_pct !== null ? q.broken_pct + '%' : '—' }}</td>
                  <td class="sub">{{ q.inspector || '—' }}</td>
                  <td><span [class]="resultClass(q.result)">{{ resultLabel(q.result) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-modal [open]="showCreate()" [title]="'New Quality Inspection'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Source GRN</label>
            <select class="ph-select" [(ngModel)]="form.grn_id" name="grn" (change)="onGrnChange()">
              <option value="">— None / free-form —</option>
              @for (g of grnOptions(); track g.id) {
                <option [value]="g.id">{{ g.no }} · {{ g.supplier_name || '—' }}</option>
              }
            </select>
          </div>
          <div class="ph-field">
            <label class="ph-label">Grade</label>
            <input class="ph-input" [(ngModel)]="form.grade" name="grade" placeholder="e.g. Premium / Regular" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Moisture %</label>
            <input class="ph-input mono" type="number" min="0" max="100" step="0.1" [(ngModel)]="form.moisture_pct" name="moisture" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Impurity %</label>
            <input class="ph-input mono" type="number" min="0" max="100" step="0.1" [(ngModel)]="form.impurity_pct" name="impurity" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Chalkiness %</label>
            <input class="ph-input mono" type="number" min="0" max="100" step="0.1" [(ngModel)]="form.chalkiness_pct" name="chalk" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Broken %</label>
            <input class="ph-input mono" type="number" min="0" max="100" step="0.1" [(ngModel)]="form.broken_pct" name="broken" />
          </div>

          <div class="ph-field">
            <label class="ph-label">Inspector</label>
            <input class="ph-input" [(ngModel)]="form.inspector" name="inspector" />
          </div>
          <div class="ph-field">
            <label class="ph-label">Result *</label>
            <select class="ph-select" [(ngModel)]="form.result" name="result" required>
              <option value="passed">✔ Passed</option>
              <option value="partial_reject">⚠ Partial Reject</option>
              <option value="rejected">✘ Rejected</option>
            </select>
          </div>

          <div class="ph-field col-3">
            <label class="ph-label">Notes</label>
            <input class="ph-input" [(ngModel)]="form.notes" name="notes" />
          </div>
        </div>

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeCreate()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Post inspection' }}
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
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-pass { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-partial { background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold-rim); }
    .s-rej  { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
  `,
})
export class QualityInspection {
  auth = inject(AuthService);
  rows = signal<QC[]>([]);
  grnOptions = signal<GRNOption[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  kpis = computed(() => {
    const r = this.rows();
    const total = r.length;
    const passed = r.filter(q => q.result === 'passed').length;
    const moistureValues = r.map(q => Number(q.moisture_pct)).filter(v => !isNaN(v) && v > 0);
    return {
      passed,
      rejects: r.filter(q => q.result !== 'passed').length,
      passRate: total ? Math.round((passed / total) * 100) : 100,
      avgMoisture: moistureValues.length
        ? Math.round((moistureValues.reduce((s, v) => s + v, 0) / moistureValues.length) * 10) / 10
        : 0,
    };
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const [qc, grn] = await Promise.all([
      supabase.from('quality_inspections').select('*').order('inspected_at', { ascending: false }),
      supabase.from('goods_receipts').select('id, no, supplier_name').order('created_at', { ascending: false }).limit(100),
    ]);
    this.loading.set(false);
    if (qc.error) { this.error.set(qc.error.message); return; }
    this.rows.set((qc.data ?? []) as QC[]);
    this.grnOptions.set((grn.data ?? []) as GRNOption[]);
  }

  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }

  onGrnChange() {
    const g = this.grnOptions().find(x => x.id === this.form.grn_id);
    this.form.grn_no = g?.no ?? null;
    this.form.supplier_name = g?.supplier_name ?? null;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'QC' });
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate QC number'); this.saving.set(false); return; }

    const payload = {
      qc_no: noData as string,
      grn_id: this.form.grn_id || null,
      grn_no: this.form.grn_no,
      supplier_name: this.form.supplier_name,
      grade: this.form.grade || null,
      moisture_pct: this.form.moisture_pct === null || this.form.moisture_pct === ('' as any) ? null : Number(this.form.moisture_pct),
      impurity_pct: this.form.impurity_pct === null || this.form.impurity_pct === ('' as any) ? null : Number(this.form.impurity_pct),
      chalkiness_pct: this.form.chalkiness_pct === null || this.form.chalkiness_pct === ('' as any) ? null : Number(this.form.chalkiness_pct),
      broken_pct: this.form.broken_pct === null || this.form.broken_pct === ('' as any) ? null : Number(this.form.broken_pct),
      inspector: this.form.inspector || null,
      result: this.form.result,
      notes: this.form.notes || null,
    };
    const { error } = await supabase.from('quality_inspections').insert(payload);
    this.saving.set(false);
    if (error) { this.formError.set(error.message); return; }
    this.closeCreate();
    await this.load();
  }

  moistureBad(v: number | null) { return v !== null && Number(v) > 14; }
  impurityBad(v: number | null) { return v !== null && Number(v) > 1; }
  resultLabel(r: QC['result']) { return r === 'passed' ? '✔ Passed' : r === 'partial_reject' ? '⚠ Partial Reject' : '✘ Rejected'; }
  resultClass(r: QC['result']) { return 'bs ' + (r === 'passed' ? 's-pass' : r === 'partial_reject' ? 's-partial' : 's-rej'); }
}
