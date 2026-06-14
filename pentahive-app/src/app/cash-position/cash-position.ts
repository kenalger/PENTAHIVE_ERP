import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../supabase.client';
import { Icon } from '../ui/icon';

/**
 * DCP — Daily Cash Position. Treasury "Cash Position" page: a read-only treasury
 * liquidity view over the live GL. Sister report to DCPR — DCPR is the daily
 * register/journal; DCP is the position/liquidity view (as-of snapshot + trend +
 * forward projection).
 *
 * All data comes from a single SECURITY DEFINER RPC, `rpc_dcp(p_as_of, p_from, p_to)`,
 * which self-gates on the `treasury` page code. The component NEVER touches the GL
 * tables or v_dcp_* views directly — those are general-ledger RLS-gated, so a
 * treasury-only user reading them would get silently-empty data. The RPC is the
 * only entry point.
 *
 * RPC contract (see rpc_dcp):
 *   {
 *     as_of, from, to,
 *     snapshot: [{ account_id, acc_name, opening, inflows, outflows, closing, tie_target, ties_to_gl }],
 *     consolidated: { opening, inflows, outflows, closing },
 *     trend: [{ date, per_account:[{ account_id, closing }], consolidated_closing }],
 *     forward: {
 *       outflows_by_bucket: { overdue, d0_7, d8_30, d30p, total },
 *       inflows_by_bucket:  { overdue, d0_7, d8_30, d30p, total },
 *       projected_closing_by_bucket: { overdue, d0_7, d8_30, d30p },  // cumulative running forecast
 *       current_consolidated,
 *       reconciliation: { ar_control, forward_inflows_total, ar_ties, ap_control, forward_outflows_total, ap_ties }
 *     }
 *   }
 */

const PAGE = 'treasury';

interface SnapshotAccount {
  account_id: number;
  acc_name: string;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  tie_target: number;
  ties_to_gl: boolean;
}

interface Consolidated {
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
}

interface TrendPoint {
  date: string;
  per_account: { account_id: number; closing: number }[];
  consolidated_closing: number;
}

interface BucketSet {
  overdue: number;
  d0_7: number;
  d8_30: number;
  d30p: number;
  total?: number;
}

interface Forward {
  outflows_by_bucket: BucketSet;
  inflows_by_bucket: BucketSet;
  projected_closing_by_bucket: BucketSet;
  current_consolidated: number;
  reconciliation: {
    ar_control: number;
    forward_inflows_total: number;
    ar_ties: boolean;
    ap_control: number;
    forward_outflows_total: number;
    ap_ties: boolean;
  };
}

interface DcpReport {
  as_of: string;
  from: string;
  to: string;
  snapshot: SnapshotAccount[];
  consolidated: Consolidated;
  trend: TrendPoint[];
  forward: Forward;
}

const BUCKETS: { key: keyof BucketSet; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'd0_7', label: '0–7 days' },
  { key: 'd8_30', label: '8–30 days' },
  { key: 'd30p', label: '30 days+' },
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-cash-position',
  imports: [FormsModule, Icon],
  template: `
    <div class="card">
      <div class="card-h no-print-flex">
        <div>
          <div class="card-t">Cash Position</div>
          <div class="sub-t">Daily Cash Position · treasury liquidity sourced from the live General Ledger</div>
        </div>
      </div>

      <div class="toolbar no-print">
        <label class="fld">
          <span class="fld-l">As of</span>
          <input class="ph-input ph-input-sm mono" type="date" [ngModel]="asOf()"
                 (ngModelChange)="asOf.set($event)" name="dcp-asof" aria-label="As-of date" />
        </label>
        <span class="fld-sep">Trend range</span>
        <label class="fld">
          <span class="fld-l">From</span>
          <input class="ph-input ph-input-sm mono" type="date" [ngModel]="fromDate()"
                 (ngModelChange)="fromDate.set($event)" name="dcp-from" aria-label="Trend from date" />
        </label>
        <label class="fld">
          <span class="fld-l">To</span>
          <input class="ph-input ph-input-sm mono" type="date" [ngModel]="toDate()"
                 (ngModelChange)="toDate.set($event)" name="dcp-to" aria-label="Trend to date" />
        </label>
        <button class="ph-btn ph-btn-primary ph-btn-sm" type="button" (click)="load()" [disabled]="loading()">
          <app-icon name="search" [size]="14" /> {{ loading() ? 'Loading…' : 'Run' }}
        </button>
        @if (report() && !loading()) {
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="print()">
            <app-icon name="receipt-text" [size]="14" /> Print
          </button>
        }
      </div>

      <div class="report-period">
        @if (report(); as r) {
          <span class="mono">As of {{ fmtDate(r.as_of) }} · trend {{ fmtDate(r.from) }} – {{ fmtDate(r.to) }}</span>
        }
      </div>

      <!-- Honest scope flag -->
      <div class="scope-note no-print">
        <app-icon name="info" [size]="13" />
        v1 shows two cash buckets (Cash on Hand, Cash in Bank); per-bank breakdown is coming once bank sub-accounts are added.
      </div>

      @if (loading()) {
        <div class="skel-wrap">
          @for (s of [1,2,3]; track s) { <div class="skel"></div> }
        </div>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">
          {{ error() }}
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="load()" style="margin-left:10px">Retry</button>
        </div>
      } @else if (!report()) {
        <div class="empty">
          <div class="ico">🏦</div>
          <div class="title">Pick an as-of date and run the position</div>
          <div class="hint">DCP reports the consolidated cash position as-of a date, the closing-balance trend across a range, and an indicative forward projection of expected receipts and disbursements.</div>
        </div>
      }

      @if (report(); as r) {
        <!-- ── SECTION A — Actual position as-of date ───────────────────── -->
        <section class="sect">
          <div class="sect-title"><app-icon name="wallet" [size]="16" /> Section A · Position as of {{ fmtDate(r.as_of) }}</div>

          @for (acc of r.snapshot; track acc.account_id) {
            <div class="acc-card">
              <header class="acc-h">
                <div class="acc-name"><app-icon name="wallet" [size]="15" /> {{ acc.acc_name }}</div>
                @if (acc.ties_to_gl) {
                  <span class="tie-badge ok"><app-icon name="check" [size]="12" /> Ties to GL</span>
                } @else {
                  <span class="tie-badge bad"><app-icon name="x" [size]="12" /> Variance {{ pesoSigned(acc.closing - acc.tie_target) }}</span>
                }
              </header>
              <div class="flow">
                <div class="flow-cell">
                  <div class="fc-lbl">Opening</div>
                  <div class="fc-val mono" [class.neg]="acc.opening < 0">{{ pesoSigned(acc.opening) }}</div>
                </div>
                <div class="flow-op">+</div>
                <div class="flow-cell">
                  <div class="fc-lbl in">Inflows</div>
                  <div class="fc-val mono in">{{ peso(acc.inflows) }}</div>
                </div>
                <div class="flow-op">−</div>
                <div class="flow-cell">
                  <div class="fc-lbl out">Outflows</div>
                  <div class="fc-val mono out">{{ peso(acc.outflows) }}</div>
                </div>
                <div class="flow-op">=</div>
                <div class="flow-cell strong">
                  <div class="fc-lbl">Closing</div>
                  <div class="fc-val mono" [class.neg]="acc.closing < 0">{{ pesoSigned(acc.closing) }}</div>
                </div>
              </div>
            </div>
          }

          <!-- Consolidated highlight -->
          <div class="cons-card">
            <div class="cons-h"><app-icon name="landmark" [size]="16" /> Consolidated cash position</div>
            <p class="cons-note">Operating inflows/outflows exclude intra-treasury transfers; consolidated closing is the sum of cash-account closings.</p>
            <div class="flow">
              <div class="flow-cell">
                <div class="fc-lbl">Opening</div>
                <div class="fc-val mono" [class.neg]="r.consolidated.opening < 0">{{ pesoSigned(r.consolidated.opening) }}</div>
              </div>
              <div class="flow-op">+</div>
              <div class="flow-cell">
                <div class="fc-lbl in">Inflows</div>
                <div class="fc-val mono in">{{ peso(r.consolidated.inflows) }}</div>
              </div>
              <div class="flow-op">−</div>
              <div class="flow-cell">
                <div class="fc-lbl out">Outflows</div>
                <div class="fc-val mono out">{{ peso(r.consolidated.outflows) }}</div>
              </div>
              <div class="flow-op">=</div>
              <div class="flow-cell strong big">
                <div class="fc-lbl">Closing</div>
                <div class="fc-val mono" [class.neg]="r.consolidated.closing < 0">{{ pesoSigned(r.consolidated.closing) }}</div>
              </div>
            </div>
            @if (allTie()) {
              <div class="cons-tie ok"><app-icon name="check" [size]="13" /> All cash accounts tie to the General Ledger</div>
            } @else {
              <div class="cons-tie bad"><app-icon name="x" [size]="13" /> One or more accounts show a variance against the GL — investigate before relying on this position</div>
            }
          </div>
        </section>

        <!-- ── SECTION B — Closing-balance trend ────────────────────────── -->
        <section class="sect">
          <div class="sect-title"><app-icon name="arrow-left-right" [size]="16" /> Section B · Closing-balance trend</div>
          @if (r.trend.length === 0) {
            <div class="none">No days in the selected range.</div>
          } @else {
            <!-- lightweight inline SVG sparkline; toggles consolidated vs per-account -->
            <div class="spark-wrap">
              <div class="spark-head no-print">
                <div class="spark-cur">
                  <span class="spark-cur-lbl">Showing</span>
                  <strong>{{ sparkAccountName() }}</strong> closing balance
                </div>
                <div class="spark-toggle" role="group" aria-label="Sparkline series">
                  <button type="button" class="seg" [class.on]="sparkAccount() === null"
                          (click)="sparkAccount.set(null)">Consolidated</button>
                  @for (acc of r.snapshot; track acc.account_id) {
                    <button type="button" class="seg" [class.on]="sparkAccount() === acc.account_id"
                            (click)="sparkAccount.set(acc.account_id)">{{ acc.acc_name }}</button>
                  }
                </div>
              </div>
              <div class="spark-plot">
                <div class="spark-yaxis mono">
                  <span>{{ pesoSigned(sparkMax()) }}</span>
                  <span>{{ pesoSigned(sparkMin()) }}</span>
                </div>
                <svg class="spark" [attr.viewBox]="'0 0 ' + sparkW() + ' ' + sparkH()" preserveAspectRatio="none" role="img" [attr.aria-label]="sparkAccountName() + ' closing-balance trend'">
                  @if (zeroLineY() !== null) {
                    <line class="spark-zero" x1="0" [attr.y1]="zeroLineY()" [attr.x2]="sparkW()" [attr.y2]="zeroLineY()" />
                  }
                  <polyline class="spark-line" [attr.points]="sparkPoints()" />
                  @for (p of sparkDots(); track p.i) {
                    <circle class="spark-dot" [class.dot-today]="p.isToday" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.isToday ? 3.5 : 2.5" />
                  }
                </svg>
              </div>
              <div class="spark-xaxis mono">
                <span>{{ fmtDate(r.from) }}</span>
                <span class="spark-today">● today</span>
                <span>{{ fmtDate(r.to) }}</span>
              </div>
            </div>
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Date</th>
                  @for (acc of r.snapshot; track acc.account_id) { <th class="tr">{{ acc.acc_name }}</th> }
                  <th class="tr strong">Consolidated</th>
                </tr>
              </thead>
              <tbody>
                @for (pt of r.trend; track pt.date) {
                  <tr>
                    <td class="mono">{{ fmtDate(pt.date) }}</td>
                    @for (acc of r.snapshot; track acc.account_id) {
                      <td class="tr mono" [class.neg]="closingFor(pt, acc.account_id) < 0">{{ pesoSigned(closingFor(pt, acc.account_id)) }}</td>
                    }
                    <td class="tr mono strong" [class.neg]="pt.consolidated_closing < 0">{{ pesoSigned(pt.consolidated_closing) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <!-- ── SECTION C — Forward projection ───────────────────────────── -->
        <section class="sect">
          <div class="sect-title"><app-icon name="banknote" [size]="16" /> Section C · Forward projection</div>
          <div class="indicative">
            <app-icon name="info" [size]="13" /> <strong>Indicative — not posted to the GL.</strong> Expected disbursements (APVs due) and receipts (AR due), bucketed by due date relative to the as-of date.
          </div>

          @if (negativeBucket(); as nb) {
            <div class="runway-warn">
              <app-icon name="x" [size]="14" />
              <span>Projected cash runs <strong>negative</strong> within the <strong>{{ nb.label }}</strong> window. Expected disbursements outpace receipts — arrange funding or defer payments before then.</span>
            </div>
          }

          <table class="grid-table fwd">
            <thead>
              <tr>
                <th>Bucket</th>
                <th class="tr">Expected outflows (APV)</th>
                <th class="tr">Expected inflows (AR)</th>
                <th class="tr strong">Projected closing</th>
              </tr>
            </thead>
            <tbody>
              <tr class="fwd-start">
                <td>Current consolidated cash</td>
                <td class="tr mono dim">—</td>
                <td class="tr mono dim">—</td>
                <td class="tr mono strong" [class.neg]="r.forward.current_consolidated < 0">{{ pesoSigned(r.forward.current_consolidated) }}</td>
              </tr>
              @for (b of buckets; track b.key) {
                <tr [class.row-neg]="bucketVal(r.forward.projected_closing_by_bucket, b.key) < 0">
                  <td>{{ b.label }}</td>
                  <td class="tr mono out">{{ peso(bucketVal(r.forward.outflows_by_bucket, b.key)) }}</td>
                  <td class="tr mono in">{{ peso(bucketVal(r.forward.inflows_by_bucket, b.key)) }}</td>
                  <td class="tr mono strong" [class.neg]="bucketVal(r.forward.projected_closing_by_bucket, b.key) < 0">
                    {{ pesoSigned(bucketVal(r.forward.projected_closing_by_bucket, b.key)) }}
                    @if (bucketVal(r.forward.projected_closing_by_bucket, b.key) < 0) {
                      <app-icon name="arrow-down" [size]="11" />
                    }
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="total">
                <td>Total expected</td>
                <td class="tr mono out">{{ peso(r.forward.outflows_by_bucket.total || 0) }}</td>
                <td class="tr mono in">{{ peso(r.forward.inflows_by_bucket.total || 0) }}</td>
                <td class="tr mono strong" [class.neg]="r.forward.projected_closing_by_bucket.d30p < 0">{{ pesoSigned(r.forward.projected_closing_by_bucket.d30p) }}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Section C reconciliation to AP/AR control -->
          <div class="recon">
            <div class="recon-row">
              <span class="recon-lbl">AR control (acct 9) vs. expected inflows</span>
              <span class="recon-vals mono">{{ pesoSigned(r.forward.reconciliation.ar_control) }} ↔ {{ pesoSigned(r.forward.reconciliation.forward_inflows_total) }}</span>
              @if (r.forward.reconciliation.ar_ties) {
                <span class="tie-badge ok"><app-icon name="check" [size]="12" /> Reconciles</span>
              } @else {
                <span class="tie-badge bad"><app-icon name="x" [size]="12" /> Variance</span>
              }
            </div>
            <div class="recon-row">
              <span class="recon-lbl">AP control (acct 22) vs. expected outflows</span>
              <span class="recon-vals mono">{{ pesoSigned(r.forward.reconciliation.ap_control) }} ↔ {{ pesoSigned(r.forward.reconciliation.forward_outflows_total) }}</span>
              @if (r.forward.reconciliation.ap_ties) {
                <span class="tie-badge ok"><app-icon name="check" [size]="12" /> Reconciles</span>
              } @else {
                <span class="tie-badge bad"><app-icon name="x" [size]="12" /> Variance</span>
              }
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .sub-t { font-size: 12px; color: var(--sub); margin-top: 3px; }
    .card-h.no-print-flex { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

    .toolbar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin: 16px 0 8px; }
    .fld { display: flex; flex-direction: column; gap: 3px; }
    .fld-l { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    .fld-sep { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; align-self: center; padding: 0 4px 6px; }
    .ph-input-sm { padding: 6px 10px; font-size: 12px; }

    .report-period { font-size: 12px; color: var(--sub); margin-bottom: 8px; }
    .scope-note { display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--sub); background: var(--raised); border: 1px solid var(--border); border-radius: var(--r8); padding: 8px 12px; margin-bottom: 16px; }

    .sect { margin-bottom: 24px; break-inside: avoid; }
    .sect-title { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: var(--text); margin-bottom: 12px; }

    .acc-card { border: 1px solid var(--border); border-radius: var(--r12); padding: 16px 18px; margin-bottom: 12px; background: var(--surface); break-inside: avoid; }
    .acc-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .acc-name { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: var(--text); }

    .flow { display: flex; align-items: stretch; gap: 6px; flex-wrap: wrap; }
    .flow-cell { flex: 1 1 0; min-width: 110px; background: var(--raised); border: 1px solid var(--border); border-radius: var(--r8); padding: 10px 12px; }
    .flow-cell.strong { border-color: var(--rim); background: var(--surface); }
    .flow-cell.big .fc-val { font-size: 20px; }
    .flow-op { align-self: center; font-size: 16px; font-weight: 700; color: var(--dim); }
    .fc-lbl { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; margin-bottom: 6px; }
    .fc-lbl.in { color: var(--sky); }
    .fc-lbl.out { color: var(--violet); }
    .fc-val { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .fc-val.in { color: var(--sky); }
    .fc-val.out { color: var(--violet); }
    .fc-val.neg, .neg { color: var(--rose); }

    .cons-card { border: 1px solid var(--gold-rim, var(--rim)); border-radius: var(--r12); padding: 18px 20px; background: linear-gradient(180deg, var(--gold-bg), transparent); break-inside: avoid; margin-top: 4px; }
    .cons-h { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: var(--text); }
    .cons-note { font-size: 10.5px; color: var(--dim); margin: 4px 0 12px; }
    .cons-tie { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 10px 0 0; }
    .cons-tie.ok { color: var(--jade); }
    .cons-tie.bad { color: var(--rose); }

    .tie-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; letter-spacing: .3px; padding: 3px 10px; border-radius: 12px; white-space: nowrap; }
    .tie-badge.ok  { color: var(--jade); background: var(--jade-bg); }
    .tie-badge.bad { color: var(--rose); background: var(--rose-bg, rgba(244,63,94,.12)); }

    .spark-wrap { border: 1px solid var(--border); border-radius: var(--r8); padding: 14px 16px 10px; margin-bottom: 12px; background: var(--surface); }
    .spark-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .spark-cur { font-size: 11.5px; color: var(--sub); }
    .spark-cur strong { color: var(--text); }
    .spark-cur-lbl { font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; color: var(--dim); margin-right: 4px; }
    .spark-toggle { display: inline-flex; border: 1px solid var(--rim); border-radius: var(--r6); overflow: hidden; }
    .seg { appearance: none; background: var(--surface); border: none; border-left: 1px solid var(--border); color: var(--sub); font: 600 11px var(--font); padding: 5px 11px; cursor: pointer; transition: background .12s, color .12s; }
    .seg:first-child { border-left: none; }
    .seg:hover { background: var(--raised); color: var(--text); }
    .seg.on { background: var(--gold); color: var(--gold-text); }
    .spark-plot { display: flex; gap: 10px; }
    .spark-yaxis { display: flex; flex-direction: column; justify-content: space-between; font-size: 9px; color: var(--dim); text-align: right; min-width: 78px; padding: 2px 0; }
    .spark { flex: 1; height: 96px; display: block; overflow: visible; }
    .spark-line { fill: none; stroke: var(--gold); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .spark-dot { fill: var(--gold); }
    .spark-dot.dot-today { fill: var(--sky); stroke: var(--surface); stroke-width: 1.5; }
    .spark-zero { stroke: var(--rose); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; opacity: .7; }
    .spark-xaxis { display: flex; justify-content: space-between; font-size: 9.5px; color: var(--dim); margin-top: 8px; padding-left: 88px; }
    .spark-today { color: var(--sky); font-weight: 700; }

    .grid-table { width: 100%; border-collapse: collapse; }
    .grid-table th { font-size: 9.5px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); }
    .grid-table td { padding: 6px 10px; font-size: 12px; color: var(--text); border-top: 1px solid var(--row-border); }
    .grid-table .tr { text-align: right; }
    .grid-table .strong { font-weight: 800; }
    .grid-table tfoot .total td { font-weight: 800; font-size: 12.5px; border-top: 2px solid var(--rim); }
    .grid-table .fwd-start td { background: var(--raised); }
    .grid-table .dim { color: var(--dim); }
    .grid-table .in { color: var(--sky); }
    .grid-table .out { color: var(--violet); }
    .grid-table tr.row-neg td { background: var(--rose-bg); }
    .grid-table tr.row-neg td:first-child { font-weight: 700; }
    .grid-table .strong app-icon { vertical-align: -1px; margin-left: 2px; }

    .indicative { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--amber); background: var(--amber-bg); border: 1px solid var(--amber); border-radius: var(--r8); padding: 8px 12px; margin-bottom: 12px; }
    .indicative app-icon { flex-shrink: 0; }
    .indicative strong { color: var(--amber); }
    .runway-warn { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--rose); background: var(--rose-bg); border: 1px solid var(--rose-rim); border-radius: var(--r8); padding: 10px 13px; margin-bottom: 12px; }
    .runway-warn app-icon { flex-shrink: 0; }
    .runway-warn strong { color: var(--rose); }

    .recon { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .recon-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--r8); background: var(--surface); }
    .recon-lbl { font-size: 12px; color: var(--sub); flex: 1 1 auto; }
    .recon-vals { font-size: 12px; font-variant-numeric: tabular-nums; }

    .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .none { font-size: 12px; color: var(--dim); padding: 8px 4px; }

    .skel-wrap { padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
    .skel { height: 96px; border-radius: var(--r8); background: linear-gradient(90deg, var(--raised) 0%, var(--float) 50%, var(--raised) 100%); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .empty { text-align: center; padding: 40px 18px; color: var(--sub); }
    .empty .ico { font-size: 38px; margin-bottom: 10px; opacity: .6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 6px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); max-width: 520px; margin: 0 auto; line-height: 1.6; }

    @media print {
      .no-print { display: none !important; }
      .card { border: none; box-shadow: none; padding: 0; }
      .acc-card, .cons-card, .sect { break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .flow-op { display: none; }
      .flow-cell { min-width: 45%; }
    }
  `,
})
export class CashPosition {
  readonly PAGE = PAGE;
  readonly buckets = BUCKETS;

  asOf = signal(todayIso());
  fromDate = signal(daysAgoIso(13));
  toDate = signal(todayIso());

  report = signal<DcpReport | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  async load() {
    const asOf = this.asOf();
    const from = this.fromDate();
    const to = this.toDate();
    if (!asOf || !from || !to) { this.error.set('Pick a valid as-of date and trend range.'); return; }
    if (from > to) { this.error.set('Trend “From” date must be on or before “To” date.'); return; }

    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase.rpc('rpc_dcp', { p_as_of: asOf, p_from: from, p_to: to });
    this.loading.set(false);

    if (error) {
      this.error.set(
        error.message?.includes('forbidden')
          ? 'You don’t have access to the Cash Position report.'
          : (error.message || 'Failed to load the cash position.'),
      );
      this.report.set(null);
      return;
    }
    this.report.set(data as DcpReport);
  }

  allTie = computed(() => {
    const r = this.report();
    return !!r && r.snapshot.every(a => a.ties_to_gl);
  });

  // First forward bucket whose projected closing dips below zero — the "runway"
  // story. Reads report() only, so a computed is correct here.
  negativeBucket = computed<{ key: string; label: string } | null>(() => {
    const r = this.report();
    if (!r) return null;
    for (const b of BUCKETS) {
      if (Number(r.forward.projected_closing_by_bucket[b.key] ?? 0) < 0) return b;
    }
    return null;
  });

  // Per-account vs consolidated sparkline toggle. Signal-backed; null = consolidated.
  sparkAccount = signal<number | null>(null);
  sparkAccountName = computed(() => {
    const id = this.sparkAccount();
    if (id === null) return 'Consolidated';
    return this.report()?.snapshot.find(a => a.account_id === id)?.acc_name ?? 'Account';
  });

  closingFor(pt: TrendPoint, accountId: number): number {
    const m = pt.per_account.find(p => p.account_id === accountId);
    return m ? Number(m.closing) : 0;
  }

  bucketVal(b: BucketSet, key: keyof BucketSet): number {
    return Number(b[key] ?? 0);
  }

  // ── sparkline geometry (consolidated closing over the trend range) ──
  private readonly SPARK_W = 600;
  private readonly SPARK_H = 90;
  sparkW() { return this.SPARK_W; }
  sparkH() { return this.SPARK_H; }

  private trendVals(): number[] {
    const r = this.report();
    if (!r) return [];
    const id = this.sparkAccount();
    if (id === null) return r.trend.map(t => Number(t.consolidated_closing));
    return r.trend.map(t => {
      const m = t.per_account.find(p => p.account_id === id);
      return m ? Number(m.closing) : 0;
    });
  }
  sparkMin = computed(() => {
    const v = this.trendVals();
    return v.length ? Math.min(...v) : 0;
  });
  sparkMax = computed(() => {
    const v = this.trendVals();
    return v.length ? Math.max(...v) : 0;
  });

  private readonly PAD = 6;
  private yFor(val: number, min: number, max: number): number {
    const span = max - min || 1;
    const innerH = this.SPARK_H - this.PAD * 2;
    return this.PAD + innerH - ((val - min) / span) * innerH;
  }
  private sparkXY(): { x: number; y: number; i: number; isToday: boolean }[] {
    const v = this.trendVals();
    if (v.length === 0) return [];
    const dates = this.report()?.trend.map(t => t.date) ?? [];
    const today = todayIso();
    const min = Math.min(...v);
    const max = Math.max(...v);
    const innerW = this.SPARK_W - this.PAD * 2;
    const step = v.length > 1 ? innerW / (v.length - 1) : 0;
    return v.map((val, i) => ({
      i,
      x: this.PAD + (v.length > 1 ? step * i : innerW / 2),
      y: this.yFor(val, min, max),
      isToday: dates[i] === today,
    }));
  }
  sparkPoints(): string {
    return this.sparkXY().map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }
  sparkDots() { return this.sparkXY(); }
  // y of the zero baseline, only when the range straddles zero (negative cash).
  zeroLineY(): number | null {
    const v = this.trendVals();
    if (v.length === 0) return null;
    const min = Math.min(...v);
    const max = Math.max(...v);
    if (min >= 0 || max <= 0) return null;
    return Number(this.yFor(0, min, max).toFixed(1));
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
  pesoSigned(n: number): string {
    const v = Number(n) || 0;
    return (v < 0 ? '-₱' : '₱') + (Math.round(Math.abs(v) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
