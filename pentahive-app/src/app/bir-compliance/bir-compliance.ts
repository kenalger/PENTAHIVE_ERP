import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../supabase.client';
import { Icon } from '../ui/icon';

/**
 * BIR Compliance — read-only PH tax reports over the live GL.
 *
 * Five tabbed reports, each backed by a SECURITY DEFINER RPC that self-gates
 * on the `bir-compliance` page code (mirrors Jinwoo's rpc_dcpr pattern). The
 * component NEVER touches journal_lines / the v_bir_* views directly — those
 * are general-ledger-RLS-gated and locked from anon/authenticated, so a
 * bir-compliance-only user reading them would get silently-empty reports.
 * The RPCs are the only entry point.
 *
 * Tie-outs are computed server-side BY CONSTRUCTION: every Output VAT / CWT /
 * EWT figure is pulled from the contra-account line of the SAME journal entry
 * (acct 20 / 6 / 19), so Σ(rows) == account period movement. The component
 * just renders the pass/fail badge the RPC returns. All money is net
 * debit−credit over entry_date with reversals included.
 *
 * RPC params are (p_from date, p_to date). All five return { date_from,
 * date_to, ..., tie_out:{label, pass, ...} }.
 */

const PAGE = 'bir-compliance';

type TabKey = 'vat' | 'sales' | 'purchase' | 'cwt' | 'ewt';

interface TabDef { key: TabKey; label: string; icon: string; rpc: string; }

const TABS: TabDef[] = [
  { key: 'vat',      label: 'VAT Summary',    icon: 'scale',        rpc: 'rpc_vat_summary' },
  { key: 'sales',    label: 'Sales Book',     icon: 'book-open',    rpc: 'rpc_sales_register' },
  { key: 'purchase', label: 'Purchase Book',  icon: 'library',      rpc: 'rpc_purchase_register' },
  { key: 'cwt',      label: 'CWT Received',   icon: 'receipt-text', rpc: 'rpc_cwt_received' },
  { key: 'ewt',      label: 'EWT Withheld',   icon: 'landmark',     rpc: 'rpc_ewt_withheld' },
];

interface TieOut { label: string; pass: boolean; rows?: number; gl?: number; grir?: number; ap?: number; ewt?: number; }

interface VatAcct { account_id: number; account_name: string; taxable_net: number; output_vat: number; is_vendo: boolean; }
interface ExemptAcct { account_id: number; account_name: string; exempt_net: number; }
interface VatSummary {
  mode: 'vat' | 'percentage';
  date_from: string; date_to: string;
  vatable: VatAcct[]; exempt: ExemptAcct[]; zero_rated: number;
  output_vat_total?: number; output_vat_from_rows?: number;
  input_vat: number; input_vat_note?: string;
  net_vat_payable: number;
  exempt_total: number; vatable_net_total: number;
  vendo_net: number; vendo_caveat: boolean;
  percentage_tax_rate?: number; percentage_tax_base?: number; percentage_tax_due?: number;
  tie_out: TieOut;
}

interface SalesRow {
  entry_id: string | null; date: string; doc_type: string; ref_no: string | null;
  customer_name: string | null; customer_tin: string | null;
  tin_status: 'ok' | 'missing' | 'no_link' | 'anonymous';
  is_reversal: boolean; taxable: number; output_vat: number; exempt: number; zero_rated: number; gross: number;
}
interface SalesReport {
  date_from: string; date_to: string; rows: SalesRow[];
  totals: { taxable: number; output_vat: number; exempt: number; zero_rated: number; gross: number };
  tie_out: TieOut;
}

interface PurchaseRow {
  entry_id: string; date: string; supplier: string | null; tin: string | null;
  tin_status: 'ok' | 'missing'; bir_registered: boolean | null; supplier_inv_no: string | null;
  is_reversal: boolean; gross: number; input_vat: number; net: number; ewt: number;
}
interface PurchaseReport {
  date_from: string; date_to: string; rows: PurchaseRow[];
  totals: { gross: number; input_vat: number; net: number; ewt: number };
  input_vat_note: string; tie_out: TieOut;
}

interface CwtRow {
  entry_id: string; date: string; or_no: string | null; customer: string | null; tin: string | null;
  tin_status: 'ok' | 'missing'; is_reversal: boolean; gross: number; cwt: number; net: number;
  cwt_2307_received: boolean; cwt_2307_ref: string | null;
}
interface CwtReport {
  date_from: string; date_to: string; rows: CwtRow[];
  totals: { gross: number; cwt: number }; tie_out: TieOut;
}

interface EwtRow {
  entry_id: string; date: string; supplier: string | null; tin: string | null;
  tin_status: 'ok' | 'missing'; bir_registered: boolean | null; supplier_inv_no: string | null;
  is_reversal: boolean; effective_atc: string | null; atc_missing: boolean;
  ewt_rate: number | null; tax_base: number; ewt: number; ewt_expected: number; partial_mismatch: boolean;
}
interface EwtReport {
  date_from: string; date_to: string; rows: EwtRow[];
  totals: { tax_base: number; ewt: number }; note: string; tie_out: TieOut;
}

function quarterRange(year: number, q: number): { from: string; to: string } {
  const startMonth = (q - 1) * 3;          // 0,3,6,9
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0);   // last day of quarter
  return { from: isoLocal(from), to: isoLocal(to) };
}
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-bir-compliance',
  imports: [FormsModule, Icon],
  template: `
    <div class="card">
      <div class="card-h no-print-flex">
        <div>
          <div class="card-t">BIR Compliance</div>
          <div class="sub-t">VAT, Sales &amp; Purchase Books, CWT and EWT schedules — sourced from the live General Ledger</div>
        </div>
        <div class="seg" role="tablist" aria-label="BIR report">
          @for (t of tabs; track t.key) {
            <button class="seg-btn" type="button" role="tab" [attr.aria-selected]="tab() === t.key"
                    [class.on]="tab() === t.key" (click)="setTab(t.key)">
              <app-icon [name]="t.icon" [size]="14" /> {{ t.label }}
            </button>
          }
        </div>
      </div>

      <!-- Period picker -->
      <div class="toolbar no-print">
        <div class="seg sm" role="tablist" aria-label="Period mode">
          <button class="seg-btn" type="button" [class.on]="mode() === 'quarter'" (click)="setMode('quarter')">Quarter</button>
          <button class="seg-btn" type="button" [class.on]="mode() === 'range'" (click)="setMode('range')">Custom range</button>
        </div>
        @if (mode() === 'quarter') {
          <label class="fld">
            <span class="fld-l">Year</span>
            <input class="ph-input ph-input-sm mono" type="number" [ngModel]="year()"
                   (ngModelChange)="year.set(+$event)" name="bir-year" aria-label="Year" />
          </label>
          <label class="fld">
            <span class="fld-l">Quarter</span>
            <select class="ph-select ph-input-sm" [ngModel]="quarter()" (ngModelChange)="quarter.set(+$event)"
                    name="bir-quarter" aria-label="Quarter">
              <option [ngValue]="1">Q1 (Jan–Mar)</option>
              <option [ngValue]="2">Q2 (Apr–Jun)</option>
              <option [ngValue]="3">Q3 (Jul–Sep)</option>
              <option [ngValue]="4">Q4 (Oct–Dec)</option>
            </select>
          </label>
        } @else {
          <label class="fld">
            <span class="fld-l">From</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="fromDate()"
                   (ngModelChange)="fromDate.set($event)" name="bir-from" aria-label="From date" />
          </label>
          <label class="fld">
            <span class="fld-l">To</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="toDate()"
                   (ngModelChange)="toDate.set($event)" name="bir-to" aria-label="To date" />
          </label>
        }
        <button class="ph-btn ph-btn-primary ph-btn-sm" type="button" (click)="load()" [disabled]="loading()">
          <app-icon name="search" [size]="14" /> {{ loading() ? 'Loading…' : 'Run report' }}
        </button>
        @if (data() && !loading()) {
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="print()">
            <app-icon name="receipt-text" [size]="14" /> Print
          </button>
          <span class="period-tag mono">{{ fmtRange() }}</span>
        }
      </div>

      <!-- States -->
      @if (loading()) {
        <div class="skel-wrap">@for (s of [1,2,3,4]; track s) { <div class="skel"></div> }</div>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">
          {{ error() }}
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="load()" style="margin-left:10px">Retry</button>
        </div>
      } @else if (!data()) {
        <div class="empty">
          <div class="ico">🏛️</div>
          <div class="title">Pick a period and run the report</div>
          <div class="hint">Each tab reads the live GL through a gated RPC and reconciles its totals back to the controlling account.</div>
        </div>
      } @else {

        <!-- Tie-out badge (shared) -->
        @if (tieOut(); as tie) {
          <div class="tie" [class.ok]="tie.pass" [class.bad]="!tie.pass">
            @if (tie.pass) { <app-icon name="check" [size]="14" /> } @else { <app-icon name="x" [size]="14" /> }
            <span class="tie-lbl">{{ tie.pass ? 'Ties to GL' : 'GL variance — investigate' }}</span>
            <span class="tie-detail">{{ tie.label }}</span>
          </div>
        }

        <!-- ═══════════ VAT SUMMARY ═══════════ -->
        @if (tab() === 'vat' && vat(); as v) {
          @if (v.vendo_caveat) {
            <div class="banner warn">
              <app-icon name="info" [size]="15" />
              <div>
                <strong>Not filing-final.</strong> Vendo sales of {{ peso(v.vendo_net) }} are included with
                <strong>zero output VAT</strong> — vendo VAT treatment is an open business decision (A2). Resolve it
                before filing this 2550Q.
              </div>
            </div>
          }

          @if (v.mode === 'percentage') {
            <div class="banner info">
              <app-icon name="info" [size]="15" />
              <div><strong>Non-VAT mode.</strong> Computing 3% Percentage Tax (2551Q) on VATable-type receipts; VAT sections are zeroed.</div>
            </div>
          }

          <div class="grid2">
            <section class="block">
              <div class="block-h">{{ v.mode === 'vat' ? 'Output Tax (VATable revenue)' : 'VATable-type receipts' }}</div>
              <table class="ph-table">
                <thead><tr><th>Account</th><th class="tr">Taxable (net)</th><th class="tr">Output VAT</th></tr></thead>
                <tbody>
                  @for (r of v.vatable; track r.account_id) {
                    <tr>
                      <td>{{ r.account_name }} @if (r.is_vendo) { <span class="flag amber">no VAT posted</span> }</td>
                      <td class="tr mono">{{ peso(r.taxable_net) }}</td>
                      <td class="tr mono">{{ peso(r.output_vat) }}</td>
                    </tr>
                  }
                  @if (v.vatable.length === 0) { <tr><td colspan="3" class="none">No VATable revenue in period.</td></tr> }
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td>Total</td>
                    <td class="tr mono">{{ peso(v.vatable_net_total) }}</td>
                    <td class="tr mono">{{ peso(v.mode === 'vat' ? (v.output_vat_total || 0) : 0) }}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section class="block">
              <div class="block-h">Exempt Sales</div>
              <table class="ph-table">
                <thead><tr><th>Account</th><th class="tr">Amount</th></tr></thead>
                <tbody>
                  @for (r of v.exempt; track r.account_id) {
                    <tr><td>{{ r.account_name }}</td><td class="tr mono">{{ peso(r.exempt_net) }}</td></tr>
                  }
                  @if (v.exempt.length === 0) { <tr><td colspan="2" class="none">No exempt sales in period.</td></tr> }
                </tbody>
                <tfoot><tr class="tot"><td>Total exempt</td><td class="tr mono">{{ peso(v.exempt_total) }}</td></tr></tfoot>
              </table>
            </section>
          </div>

          <section class="totals-strip">
            <div class="ts-cell">
              <div class="ts-lbl">Zero-rated</div><div class="ts-val mono">{{ peso(v.zero_rated) }}</div>
            </div>
            <div class="ts-cell">
              <div class="ts-lbl">Input VAT (creditable)</div>
              <div class="ts-val mono">{{ peso(0) }}</div>
              <div class="ts-note">{{ v.input_vat_note }}</div>
            </div>
            @if (v.mode === 'vat') {
              <div class="ts-cell strong">
                <div class="ts-lbl">Net VAT Payable</div><div class="ts-val mono">{{ peso(v.net_vat_payable) }}</div>
                <div class="ts-note">Output {{ peso(v.output_vat_total || 0) }} − Input ₱0.00</div>
              </div>
            } @else {
              <div class="ts-cell strong">
                <div class="ts-lbl">Percentage Tax Due (3%)</div><div class="ts-val mono">{{ peso(v.percentage_tax_due || 0) }}</div>
                <div class="ts-note">3% × {{ peso(v.percentage_tax_base || 0) }} base</div>
              </div>
            }
          </section>
        }

        <!-- ═══════════ SALES BOOK ═══════════ -->
        @if (tab() === 'sales' && sales(); as s) {
          @if (s.rows.length === 0) {
            <div class="empty sm"><div class="ico">🧾</div><div class="title">No sales in this period</div></div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Ref No</th><th>Customer</th><th>TIN</th>
                    <th class="tr">Taxable</th><th class="tr">Output VAT</th><th class="tr">Exempt</th>
                    <th class="tr">Zero-rated</th><th class="tr">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of s.rows; track r.entry_id || (r.doc_type + r.date)) {
                    <tr [class.is-rev]="r.is_reversal">
                      <td class="mono">{{ fmtDate(r.date) }}</td>
                      <td><span class="doc">{{ r.doc_type }}</span></td>
                      <td class="mono">{{ r.ref_no || '—' }}</td>
                      <td>{{ r.customer_name || '—' }} @if (r.is_reversal) { <span class="flag amber">REVERSAL</span> }</td>
                      <td>{{ tinCell(r.customer_tin, r.tin_status) }}</td>
                      <td class="tr mono">{{ peso(r.taxable) }}</td>
                      <td class="tr mono">{{ peso(r.output_vat) }}</td>
                      <td class="tr mono">{{ peso(r.exempt) }}</td>
                      <td class="tr mono">{{ peso(r.zero_rated) }}</td>
                      <td class="tr mono">{{ peso(r.gross) }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td colspan="5">Totals</td>
                    <td class="tr mono">{{ peso(s.totals.taxable) }}</td>
                    <td class="tr mono">{{ peso(s.totals.output_vat) }}</td>
                    <td class="tr mono">{{ peso(s.totals.exempt) }}</td>
                    <td class="tr mono">{{ peso(s.totals.zero_rated) }}</td>
                    <td class="tr mono">{{ peso(s.totals.gross) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="legend">
              <span class="flag rose">TIN missing</span> needs a TIN on file ·
              <span class="flag slate">TIN — link customer</span> source has free-text customer (WB / toll), no FK to link a TIN ·
              <span class="flag slate">Various / anonymous</span> cash-retail vendo, aggregated per day (no TIN required).
            </div>
          }
        }

        <!-- ═══════════ PURCHASE BOOK ═══════════ -->
        @if (tab() === 'purchase' && purchase(); as p) {
          @if (p.rows.length === 0) {
            <div class="empty sm"><div class="ico">📦</div><div class="title">No supplier bills in this period</div></div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead>
                  <tr><th>Date</th><th>Supplier</th><th>TIN</th><th>Supplier Inv No</th>
                      <th class="tr">Gross</th><th class="tr">Input VAT</th><th class="tr">Net</th><th class="tr">EWT</th></tr>
                </thead>
                <tbody>
                  @for (r of p.rows; track r.entry_id) {
                    <tr [class.is-rev]="r.is_reversal">
                      <td class="mono">{{ fmtDate(r.date) }}</td>
                      <td>{{ r.supplier || '—' }}
                        @if (r.bir_registered === false) { <span class="flag amber">not BIR-reg</span> }
                        @if (r.is_reversal) { <span class="flag amber">REVERSAL</span> }
                      </td>
                      <td>{{ tinCell(r.tin, r.tin_status) }}</td>
                      <td class="mono">{{ r.supplier_inv_no || '—' }}</td>
                      <td class="tr mono">{{ peso(r.gross) }}</td>
                      <td class="tr mono sub">{{ peso(0) }}</td>
                      <td class="tr mono">{{ peso(r.net) }}</td>
                      <td class="tr mono">{{ peso(r.ewt) }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td colspan="4">Totals</td>
                    <td class="tr mono">{{ peso(p.totals.gross) }}</td>
                    <td class="tr mono">{{ peso(0) }}</td>
                    <td class="tr mono">{{ peso(p.totals.net) }}</td>
                    <td class="tr mono">{{ peso(p.totals.ewt) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="legend">{{ p.input_vat_note }}</div>
          }
        }

        <!-- ═══════════ CWT RECEIVED ═══════════ -->
        @if (tab() === 'cwt' && cwt(); as c) {
          @if (c.rows.length === 0) {
            <div class="empty sm"><div class="ico">📨</div><div class="title">No customer CWT in this period</div></div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead>
                  <tr><th>Date</th><th>OR No</th><th>Customer</th><th>TIN</th>
                      <th class="tr">Gross</th><th class="tr">CWT Withheld</th><th class="tr">Net</th>
                      <th>2307 Received?</th><th>2307 Ref</th></tr>
                </thead>
                <tbody>
                  @for (r of c.rows; track r.entry_id) {
                    <tr [class.is-rev]="r.is_reversal">
                      <td class="mono">{{ fmtDate(r.date) }}</td>
                      <td class="mono">{{ r.or_no || '—' }}</td>
                      <td>{{ r.customer || '—' }} @if (r.is_reversal) { <span class="flag amber">REVERSAL</span> }</td>
                      <td>{{ tinCell(r.tin, r.tin_status) }}</td>
                      <td class="tr mono">{{ peso(r.gross) }}</td>
                      <td class="tr mono">{{ peso(r.cwt) }}</td>
                      <td class="tr mono">{{ peso(r.net) }}</td>
                      <td>
                        @if (r.cwt_2307_received) { <span class="flag jade">Received</span> }
                        @else { <span class="flag rose">Awaiting 2307</span> }
                      </td>
                      <td class="mono">{{ r.cwt_2307_ref || '—' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td colspan="4">Totals</td>
                    <td class="tr mono">{{ peso(c.totals.gross) }}</td>
                    <td class="tr mono">{{ peso(c.totals.cwt) }}</td>
                    <td colspan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        }

        <!-- ═══════════ EWT WITHHELD ═══════════ -->
        @if (tab() === 'ewt' && ewt(); as e) {
          <div class="banner info">
            <app-icon name="info" [size]="15" />
            <div>{{ e.note }}</div>
          </div>
          @if (e.rows.length === 0) {
            <div class="empty sm"><div class="ico">🏛️</div><div class="title">No EWT withheld in this period</div></div>
          } @else {
            <div class="tw">
              <table class="ph-table">
                <thead>
                  <tr><th>Date</th><th>Supplier</th><th>TIN</th><th>Supplier Inv No</th><th>ATC / Rate</th>
                      <th class="tr">Tax Base</th><th class="tr">EWT Amount</th></tr>
                </thead>
                <tbody>
                  @for (r of e.rows; track r.entry_id) {
                    <tr [class.is-rev]="r.is_reversal">
                      <td class="mono">{{ fmtDate(r.date) }}</td>
                      <td>{{ r.supplier || '—' }}
                        @if (r.bir_registered === false) { <span class="flag amber">not BIR-reg</span> }
                        @if (r.is_reversal) { <span class="flag amber">REVERSAL</span> }
                      </td>
                      <td>{{ tinCell(r.tin, r.tin_status) }}</td>
                      <td class="mono">{{ r.supplier_inv_no || '—' }}</td>
                      <td>
                        @if (r.atc_missing) { <span class="flag rose">ATC missing</span> }
                        @else { <span class="atc mono">{{ r.effective_atc }}</span> }
                        <span class="rate mono">{{ pct(r.ewt_rate) }}</span>
                      </td>
                      <td class="tr mono">{{ peso(r.tax_base) }}</td>
                      <td class="tr mono">{{ peso(r.ewt) }}
                        @if (r.partial_mismatch) { <span class="flag amber" title="Booked EWT differs from rate × base — likely partial receipt">partial?</span> }
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td colspan="5">Totals</td>
                    <td class="tr mono">{{ peso(e.totals.tax_base) }}</td>
                    <td class="tr mono">{{ peso(e.totals.ewt) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="legend">
              <span class="flag rose">ATC missing</span> blocks a printable Form 2307 — capture the ATC on the supplier bill ·
              <span class="flag amber">partial?</span> booked EWT ≠ rate × booked base; reconcile against partial receipts.
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .sub-t { font-size: 12px; color: var(--sub); margin-top: 3px; }
    .card-h.no-print-flex { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

    .seg { display: inline-flex; gap: 4px; background: var(--raised); border: 1px solid var(--border); border-radius: var(--r8); padding: 3px; flex-wrap: wrap; }
    .seg.sm .seg-btn { padding: 5px 10px; }
    .seg-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--sub); font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: var(--r6); cursor: pointer; font-family: var(--font); white-space: nowrap; }
    .seg-btn:hover { color: var(--text); }
    .seg-btn.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(15,23,42,.08); }

    .toolbar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin: 16px 0 10px; }
    .fld { display: flex; flex-direction: column; gap: 3px; }
    .fld-l { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    .ph-input-sm { padding: 6px 10px; font-size: 12px; }
    .period-tag { font-size: 11px; color: var(--sub); margin-left: auto; }

    /* Tie-out badge */
    .tie { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: var(--r8); font-size: 12px; font-weight: 700; margin-bottom: 14px; }
    .tie.ok  { color: var(--jade); background: var(--jade-bg); }
    .tie.bad { color: var(--rose); background: var(--rose-bg, rgba(244,63,94,.12)); }
    .tie-detail { font-weight: 500; color: var(--sub); font-size: 11px; }

    /* Banners */
    .banner { display: flex; gap: 10px; align-items: flex-start; padding: 11px 14px; border-radius: var(--r8); font-size: 12px; line-height: 1.5; margin-bottom: 14px; }
    .banner.warn { background: var(--amber-bg); color: var(--amber); }
    .banner.info { background: var(--sky-bg); color: var(--sky); }
    .banner strong { font-weight: 800; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .block-h { font-size: 11px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--sub); margin-bottom: 8px; }

    .ph-table .tr { text-align: right; }
    .ph-table tfoot .tot td { border-top: 2px solid var(--rim); font-weight: 800; }
    .ph-table tbody tr.is-rev { background: var(--amber-bg); }
    .none { color: var(--dim); font-size: 12px; padding: 10px; text-align: center; }
    .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .sub { color: var(--sub); }
    .tw { overflow-x: auto; }

    .doc { font-size: 10px; font-weight: 800; letter-spacing: .4px; padding: 2px 7px; border-radius: 8px; background: var(--float); color: var(--sub); }

    .flag { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: .3px; padding: 1px 6px; border-radius: 8px; vertical-align: middle; margin-left: 4px; white-space: nowrap; }
    .flag.rose  { color: var(--rose); background: var(--rose-bg, rgba(244,63,94,.12)); }
    .flag.amber { color: var(--amber); background: var(--amber-bg); }
    .flag.jade  { color: var(--jade); background: var(--jade-bg); }
    .flag.slate { color: var(--sub); background: var(--raised); }
    .atc { font-size: 11px; font-weight: 700; color: var(--text); }
    .rate { font-size: 10.5px; color: var(--sub); margin-left: 6px; }

    .totals-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .ts-cell { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r8); padding: 14px; }
    .ts-cell.strong { border-color: var(--rim); background: linear-gradient(180deg, var(--gold-bg), transparent); }
    .ts-lbl { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; margin-bottom: 6px; }
    .ts-val { font-size: 18px; font-weight: 800; }
    .ts-note { font-size: 10.5px; color: var(--sub); margin-top: 6px; line-height: 1.4; }

    .legend { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--dim); line-height: 1.7; }

    .skel-wrap { padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
    .skel { height: 60px; border-radius: var(--r8); background: linear-gradient(90deg, var(--raised) 0%, var(--float) 50%, var(--raised) 100%); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .empty { text-align: center; padding: 40px 18px; color: var(--sub); }
    .empty.sm { padding: 28px 18px; }
    .empty .ico { font-size: 38px; margin-bottom: 10px; opacity: .6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 6px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); max-width: 480px; margin: 0 auto; line-height: 1.6; }

    @media print {
      .no-print, .no-print-flex .seg { display: none !important; }
      .card { border: none; box-shadow: none; padding: 0; }
      .grid2, .totals-strip { break-inside: avoid; }
    }
    @media (max-width: 820px) {
      .grid2 { grid-template-columns: 1fr; }
      .totals-strip { grid-template-columns: 1fr; }
      .period-tag { margin-left: 0; }
    }
  `,
})
export class BirCompliance {
  readonly PAGE = PAGE;
  readonly tabs = TABS;

  tab = signal<TabKey>('vat');
  mode = signal<'quarter' | 'range'>('quarter');
  year = signal(new Date().getFullYear());
  quarter = signal(Math.floor(new Date().getMonth() / 3) + 1);
  fromDate = signal('');
  toDate = signal('');

  loading = signal(false);
  error = signal<string | null>(null);

  // One bucket per tab so switching tabs doesn't refetch needlessly.
  vat = signal<VatSummary | null>(null);
  sales = signal<SalesReport | null>(null);
  purchase = signal<PurchaseReport | null>(null);
  cwt = signal<CwtReport | null>(null);
  ewt = signal<EwtReport | null>(null);

  data = computed(() => {
    switch (this.tab()) {
      case 'vat': return this.vat();
      case 'sales': return this.sales();
      case 'purchase': return this.purchase();
      case 'cwt': return this.cwt();
      case 'ewt': return this.ewt();
    }
  });

  tieOut = computed<TieOut | null>(() => {
    const d = this.data() as { tie_out?: TieOut } | null;
    return d?.tie_out ?? null;
  });

  constructor() {
    const { from, to } = quarterRange(this.year(), this.quarter());
    this.fromDate.set(from);
    this.toDate.set(to);
    this.load();
  }

  setTab(t: TabKey) {
    this.tab.set(t);
    if (!this.data()) this.load();
  }

  setMode(m: 'quarter' | 'range') {
    this.mode.set(m);
    if (m === 'range' && !this.fromDate()) {
      const { from, to } = this.resolveRange();
      this.fromDate.set(from);
      this.toDate.set(to);
    }
  }

  private resolveRange(): { from: string; to: string } {
    return this.mode() === 'quarter'
      ? quarterRange(this.year(), this.quarter())
      : { from: this.fromDate(), to: this.toDate() };
  }

  // Clear cached buckets so a new period forces a fresh fetch on each tab.
  private invalidate() {
    this.vat.set(null); this.sales.set(null); this.purchase.set(null);
    this.cwt.set(null); this.ewt.set(null);
  }

  async load() {
    const { from, to } = this.resolveRange();
    if (!from || !to) { this.error.set('Pick a valid period.'); return; }
    if (from > to) { this.error.set('“From” date must be on or before “To” date.'); return; }

    // A run with a fresh period invalidates all cached tabs.
    const def = this.tabs.find(t => t.key === this.tab())!;
    if (this.lastFrom !== from || this.lastTo !== to) {
      this.invalidate();
      this.lastFrom = from; this.lastTo = to;
    }

    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase.rpc(def.rpc, { p_from: from, p_to: to });
    this.loading.set(false);

    if (error) {
      this.error.set(
        error.message?.includes('forbidden')
          ? 'You don’t have access to the BIR Compliance reports.'
          : (error.message || 'Failed to load the report.'),
      );
      return;
    }
    switch (this.tab()) {
      case 'vat': this.vat.set(data as VatSummary); break;
      case 'sales': this.sales.set(data as SalesReport); break;
      case 'purchase': this.purchase.set(data as PurchaseReport); break;
      case 'cwt': this.cwt.set(data as CwtReport); break;
      case 'ewt': this.ewt.set(data as EwtReport); break;
    }
  }
  private lastFrom = '';
  private lastTo = '';

  tinCell(tin: string | null, status: string): string {
    if (tin && tin.trim()) return tin;
    switch (status) {
      case 'missing': return '⚠ TIN missing';
      case 'no_link': return '⚠ TIN — link customer';
      case 'anonymous': return '—';
      default: return '⚠ TIN missing';
    }
  }

  fmtRange(): string {
    const d = this.data() as { date_from?: string; date_to?: string } | null;
    if (!d?.date_from) return '';
    return `${this.fmtDate(d.date_from)} – ${this.fmtDate(d.date_to!)}`;
  }

  print() { window.print(); }

  fmtDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
  }
  peso(n: number): string {
    return '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  pct(r: number | null): string {
    if (r === null || r === undefined) return '';
    return (Number(r) * 100).toLocaleString('en-PH', { maximumFractionDigits: 2 }) + '%';
  }
}
