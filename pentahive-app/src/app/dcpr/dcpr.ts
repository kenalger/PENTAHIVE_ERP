import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../supabase.client';
import { Icon } from '../ui/icon';

/**
 * Daily Collection & Payment Report (DCPR) — read-only cash-accountability report
 * over the live GL. Doubles as the Cash Receipts Book + Cash Disbursements Book.
 *
 * All data comes from a single SECURITY DEFINER RPC, `rpc_dcpr(p_date_from, p_date_to)`,
 * which self-gates on the `dcpr` page code. The component NEVER touches journal_lines /
 * v_dcpr_lines directly — those are gated on `general-ledger`, so a dcpr-only user
 * reading them would get silently-empty data. The RPC is the only entry point.
 *
 * RPC contract (see rpc_dcpr):
 *   {
 *     date_from, date_to,
 *     per_account: [{ account_id, acc_name, opening, receipts[], payments[],
 *                     transfers[], totals:{receipts,payments,net}, closing,
 *                     tie_target, ties_to_gl }],
 *     consolidated: { opening, receipts, payments, net, closing }
 *   }
 * A receipt/payment/transfer line carries:
 *   { entry_id, entry_no, entry_date, line_no, doc_type, ref_no, party,
 *     particulars, acc_name, amount, debit|credit, is_transfer, is_reversal,
 *     is_reversed, entry_type }
 */

const PAGE = 'dcpr';

// Display ordering for receipt/payment type subtotals.
const TYPE_ORDER = [
  'Customer Collection',
  'Weighbridge Cash',
  'Toll Milling',
  'Vendo Income',
  'Supplier Payment',
  'Vendo Expense',
  'Other',
];

interface DcprLine {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  line_no: number;
  doc_type: string;
  ref_no: string | null;
  party: string | null;
  particulars: string | null;
  acc_name: string;
  amount: number;   // present on receipts (=debit) and payments (=credit)
  debit?: number;   // present on transfers (and receipts)
  credit?: number;  // present on transfers (and payments)
  is_transfer: boolean;
  is_reversal: boolean;
  is_reversed: boolean;
  entry_type: string;
}

interface DcprAccount {
  account_id: number;
  acc_name: string;
  opening: number;
  receipts: DcprLine[];
  payments: DcprLine[];
  transfers: DcprLine[];
  totals: { receipts: number; payments: number; net: number };
  closing: number;
  tie_target: number;
  ties_to_gl: boolean;
}

interface DcprConsolidated {
  opening: number;
  receipts: number;
  payments: number;
  net: number;
  closing: number;
}

interface DcprReport {
  date_from: string;
  date_to: string;
  per_account: DcprAccount[];
  consolidated: DcprConsolidated;
}

interface TypeGroup {
  type: string;
  lines: DcprLine[];
  subtotal: number;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function groupByType(lines: DcprLine[]): TypeGroup[] {
  const byType = new Map<string, TypeGroup>();
  for (const l of lines) {
    let g = byType.get(l.doc_type);
    if (!g) { g = { type: l.doc_type, lines: [], subtotal: 0 }; byType.set(l.doc_type, g); }
    g.lines.push(l);
    g.subtotal += Number(l.amount) || 0;
  }
  return [...byType.values()].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.type), ib = TYPE_ORDER.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.type.localeCompare(b.type);
  });
}

@Component({
  selector: 'app-dcpr',
  imports: [FormsModule, Icon],
  template: `
    <div class="card">
      <div class="card-h no-print-flex">
        <div>
          <div class="card-t">Daily Collection &amp; Payment Report</div>
          <div class="sub-t">Cash Receipts &amp; Disbursements Book · sourced from the live General Ledger</div>
        </div>
        <div class="seg" role="tablist" aria-label="Report range mode">
          <button class="seg-btn" type="button" role="tab" [attr.aria-selected]="mode() === 'day'"
                  [class.on]="mode() === 'day'" (click)="setMode('day')">
            <app-icon name="banknote" [size]="14" /> Single day
          </button>
          <button class="seg-btn" type="button" role="tab" [attr.aria-selected]="mode() === 'range'"
                  [class.on]="mode() === 'range'" (click)="setMode('range')">
            <app-icon name="arrow-left-right" [size]="14" /> Date range
          </button>
        </div>
      </div>

      <div class="toolbar no-print">
        @if (mode() === 'day') {
          <label class="fld">
            <span class="fld-l">Date</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="day()"
                   (ngModelChange)="day.set($event)" name="dcpr-day" aria-label="Report date" />
          </label>
        } @else {
          <label class="fld">
            <span class="fld-l">From</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="fromDate()"
                   (ngModelChange)="fromDate.set($event)" name="dcpr-from" aria-label="From date" />
          </label>
          <label class="fld">
            <span class="fld-l">To</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="toDate()"
                   (ngModelChange)="toDate.set($event)" name="dcpr-to" aria-label="To date" />
          </label>
        }
        <button class="ph-btn ph-btn-primary ph-btn-sm" type="button" (click)="load()" [disabled]="loading()">
          <app-icon name="search" [size]="14" /> {{ loading() ? 'Loading…' : 'Run report' }}
        </button>
        @if (report() && !loading()) {
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="print()">
            <app-icon name="receipt-text" [size]="14" /> Print
          </button>
        }
      </div>

      <div class="report-period">
        @if (report()) {
          <span class="mono">{{ fmtRange() }}</span>
        }
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
          <div class="title">Pick a date and run the report</div>
          <div class="hint">DCPR reconciles cash on hand and in bank against the books — opening, receipts, payments and closing per cash account.</div>
        </div>
      } @else if (isEmpty()) {
        <div class="empty">
          <div class="ico">💤</div>
          <div class="title">No cash movement in this period</div>
          <div class="hint">No receipts or payments hit the cash accounts for {{ fmtRange() }}. Opening balances are carried through unchanged.</div>
          <!-- Still render the opening/closing panels below so the cashier sees the standing balance. -->
        </div>
      }

      @if (report(); as r) {
        @for (acc of r.per_account; track acc.account_id) {
          <section class="panel" [class.panel-empty]="!hasActivity(acc)">
            <header class="panel-h">
              <div class="panel-name">
                <app-icon name="wallet" [size]="16" /> {{ acc.acc_name }}
              </div>
              @if (acc.ties_to_gl) {
                <span class="tie-badge ok"><app-icon name="check" [size]="12" /> Ties to GL</span>
              } @else {
                <span class="tie-badge bad">
                  <app-icon name="x" [size]="12" /> Variance {{ pesoSigned(acc.closing - acc.tie_target) }}
                </span>
              }
            </header>

            <div class="open-row">
              <span class="lbl">Opening balance</span>
              <span class="amt mono" [class.neg]="acc.opening < 0">{{ pesoSigned(acc.opening) }}</span>
            </div>

            <!-- RECEIPTS -->
            <div class="sect-h rcpt"><app-icon name="arrow-down" [size]="13" /> Receipts (Dr)</div>
            @if (acc.receipts.length === 0) {
              <div class="none">No receipts.</div>
            } @else {
              <table class="ledger">
                <thead>
                  <tr>
                    <th>Date</th><th>Ref No</th><th>Payor</th><th>Particulars</th>
                    <th class="tr">Amount (Dr)</th>
                  </tr>
                </thead>
                @for (g of receiptGroups(acc); track g.type) {
                  <tbody>
                    <tr class="type-row"><td colspan="5">{{ g.type }}</td></tr>
                    @for (l of g.lines; track l.entry_id + '-' + l.line_no) {
                      <tr [class.is-rev]="l.is_reversal">
                        <td class="mono">{{ fmtDate(l.entry_date) }}</td>
                        <td class="mono ref">{{ l.ref_no || l.entry_no }}<span class="entry-sub mono"> · {{ l.entry_no }}</span></td>
                        <td>{{ l.party || '—' }} @if (badge(l); as b) {<span class="rev-tag">{{ b }}</span>}</td>
                        <td class="sub">{{ l.particulars || '—' }}</td>
                        <td class="tr mono dr">{{ peso(l.amount) }}</td>
                      </tr>
                    }
                    <tr class="subtotal">
                      <td colspan="4">Subtotal · {{ g.type }}</td>
                      <td class="tr mono">{{ peso(g.subtotal) }}</td>
                    </tr>
                  </tbody>
                }
                <tfoot>
                  <tr class="total"><td colspan="4">Total Receipts</td>
                    <td class="tr mono dr">{{ peso(acc.totals.receipts) }}</td></tr>
                </tfoot>
              </table>
            }

            <!-- PAYMENTS -->
            <div class="sect-h pay"><app-icon name="arrow-right" [size]="13" /> Payments (Cr)</div>
            @if (acc.payments.length === 0) {
              <div class="none">No payments.</div>
            } @else {
              <table class="ledger">
                <thead>
                  <tr>
                    <th>Date</th><th>Ref No</th><th>Payee</th><th>Particulars</th>
                    <th class="tr">Amount (Cr)</th>
                  </tr>
                </thead>
                @for (g of paymentGroups(acc); track g.type) {
                  <tbody>
                    <tr class="type-row"><td colspan="5">{{ g.type }}</td></tr>
                    @for (l of g.lines; track l.entry_id + '-' + l.line_no) {
                      <tr [class.is-rev]="l.is_reversal">
                        <td class="mono">{{ fmtDate(l.entry_date) }}</td>
                        <td class="mono ref">{{ l.ref_no || l.entry_no }}<span class="entry-sub mono"> · {{ l.entry_no }}</span></td>
                        <td>{{ l.party || '—' }} @if (badge(l); as b) {<span class="rev-tag">{{ b }}</span>}</td>
                        <td class="sub">{{ l.particulars || '—' }}</td>
                        <td class="tr mono cr">{{ peso(l.amount) }}</td>
                      </tr>
                    }
                    <tr class="subtotal">
                      <td colspan="4">Subtotal · {{ g.type }}</td>
                      <td class="tr mono">{{ peso(g.subtotal) }}</td>
                    </tr>
                  </tbody>
                }
                <tfoot>
                  <tr class="total"><td colspan="4">Total Payments</td>
                    <td class="tr mono cr">{{ peso(acc.totals.payments) }}</td></tr>
                </tfoot>
              </table>
            }

            <!-- TRANSFERS (tagged subset; already counted in receipts/payments above) -->
            @if (acc.transfers.length > 0) {
              <div class="sect-h xfer"><app-icon name="arrow-left-right" [size]="13" /> Transfers between cash accounts</div>
              <p class="xfer-note">Intra-treasury movements — included in this panel's totals, but excluded from consolidated operating receipts/payments below.</p>
              <table class="ledger">
                <thead>
                  <tr><th>Date</th><th>Ref No</th><th>Counterparty</th><th>Particulars</th><th class="tr">Dr</th><th class="tr">Cr</th></tr>
                </thead>
                <tbody>
                  @for (l of acc.transfers; track l.entry_id + '-' + l.line_no) {
                    <tr [class.is-rev]="l.is_reversal">
                      <td class="mono">{{ fmtDate(l.entry_date) }}</td>
                      <td class="mono ref">{{ l.ref_no || l.entry_no }}</td>
                      <td>{{ l.party || '—' }} @if (badge(l); as b) {<span class="rev-tag">{{ b }}</span>}</td>
                      <td class="sub">{{ l.particulars || '—' }}</td>
                      <td class="tr mono dr">{{ (l.debit || 0) > 0 ? peso(l.debit || 0) : '' }}</td>
                      <td class="tr mono cr">{{ (l.credit || 0) > 0 ? peso(l.credit || 0) : '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }

            <!-- NET + CLOSING -->
            <div class="net-row">
              <span class="lbl">Net movement (Receipts − Payments)</span>
              <span class="amt mono" [class.neg]="acc.totals.net < 0">{{ pesoSigned(acc.totals.net) }}</span>
            </div>
            <div class="close-row">
              <span class="lbl">Closing balance</span>
              <span class="amt mono" [class.neg]="acc.closing < 0">{{ pesoSigned(acc.closing) }}</span>
            </div>
          </section>
        }

        <!-- CONSOLIDATED FOOTER -->
        <section class="consolidated">
          <div class="cons-h"><app-icon name="landmark" [size]="16" /> Consolidated — all cash accounts</div>
          <p class="cons-note">Operating receipts/payments exclude intra-treasury transfers.</p>
          <div class="cons-grid">
            <div class="cons-cell">
              <div class="cons-lbl">Opening</div>
              <div class="cons-val mono" [class.neg]="r.consolidated.opening < 0">{{ pesoSigned(r.consolidated.opening) }}</div>
            </div>
            <div class="cons-cell">
              <div class="cons-lbl">Receipts</div>
              <div class="cons-val mono dr">{{ peso(r.consolidated.receipts) }}</div>
            </div>
            <div class="cons-cell">
              <div class="cons-lbl">Payments</div>
              <div class="cons-val mono cr">{{ peso(r.consolidated.payments) }}</div>
            </div>
            <div class="cons-cell">
              <div class="cons-lbl">Net</div>
              <div class="cons-val mono" [class.neg]="r.consolidated.net < 0">{{ pesoSigned(r.consolidated.net) }}</div>
            </div>
            <div class="cons-cell strong">
              <div class="cons-lbl">Closing</div>
              <div class="cons-val mono" [class.neg]="r.consolidated.closing < 0">{{ pesoSigned(r.consolidated.closing) }}</div>
            </div>
          </div>
          @if (allTie()) {
            <div class="cons-tie ok"><app-icon name="check" [size]="13" /> All cash accounts tie to the General Ledger</div>
          } @else {
            <div class="cons-tie bad"><app-icon name="x" [size]="13" /> One or more accounts show a variance against the GL — investigate before relying on this report</div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }
    .sub-t { font-size: 12px; color: var(--sub); margin-top: 3px; }
    .card-h.no-print-flex { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

    .seg { display: inline-flex; gap: 4px; background: var(--raised); border: 1px solid var(--border); border-radius: var(--r8); padding: 3px; }
    .seg-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--sub); font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: var(--r6); cursor: pointer; font-family: var(--font); white-space: nowrap; }
    .seg-btn:hover { color: var(--text); }
    .seg-btn.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(15,23,42,.08); }

    .toolbar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin: 16px 0 8px; }
    .fld { display: flex; flex-direction: column; gap: 3px; }
    .fld-l { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    .ph-input-sm { padding: 6px 10px; font-size: 12px; }

    .report-period { font-size: 12px; color: var(--sub); margin-bottom: 10px; }

    .panel { border: 1px solid var(--border); border-radius: var(--r12); padding: 18px 20px; margin-bottom: 18px; background: var(--surface); break-inside: avoid; }
    .panel-empty { opacity: .85; }
    .panel-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
    .panel-name { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: var(--text); }

    .tie-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; letter-spacing: .3px; padding: 3px 10px; border-radius: 12px; }
    .tie-badge.ok  { color: var(--jade); background: var(--jade-bg); }
    .tie-badge.bad { color: var(--rose); background: var(--rose-bg, rgba(244,63,94,.12)); }

    .open-row, .net-row, .close-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px; }
    .open-row { border-bottom: 1px dashed var(--border); }
    .net-row { margin-top: 10px; border-top: 1px solid var(--border); }
    .close-row { font-weight: 800; font-size: 14px; border-top: 2px solid var(--rim); margin-top: 2px; }
    .open-row .lbl, .net-row .lbl, .close-row .lbl { color: var(--sub); font-size: 12.5px; }
    .close-row .lbl { color: var(--text); }
    .amt { font-variant-numeric: tabular-nums; font-weight: 700; }
    .amt.neg, .cons-val.neg { color: var(--rose); }

    .sect-h { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; margin: 16px 0 6px; }
    .sect-h.rcpt { color: var(--sky); }
    .sect-h.pay  { color: var(--violet); }
    .sect-h.xfer { color: var(--amber); }
    .xfer-note, .cons-note { font-size: 10.5px; color: var(--dim); margin: 0 0 6px; }
    .none { font-size: 12px; color: var(--dim); padding: 4px 4px 6px; }

    table.ledger { width: 100%; border-collapse: collapse; }
    .ledger th { font-size: 9.5px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); }
    .ledger td { padding: 6px 10px; font-size: 12px; color: var(--text); border-top: 1px solid var(--row-border); }
    .ledger .type-row td { font-size: 10.5px; font-weight: 800; letter-spacing: .4px; color: var(--sub); text-transform: uppercase; background: var(--raised); border-top: none; padding-top: 8px; }
    .ledger .subtotal td { font-weight: 700; font-size: 11.5px; color: var(--sub); border-top: 1px dashed var(--rim); }
    .ledger tfoot .total td { font-weight: 800; font-size: 12.5px; border-top: 2px solid var(--rim); padding: 10px; }
    .ledger tr.is-rev { background: var(--amber-bg); }
    .ref .entry-sub { color: var(--dim); font-size: 10.5px; }

    .dr { color: var(--sky); }
    .cr { color: var(--violet); }
    .tr { text-align: right; }
    .sub { color: var(--sub); }
    .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .rev-tag { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: .3px; color: var(--amber); background: var(--amber-bg); padding: 1px 6px; border-radius: 8px; vertical-align: middle; }

    .consolidated { border: 1px solid var(--gold-rim, var(--rim)); border-radius: var(--r12); padding: 18px 20px; background: linear-gradient(180deg, var(--gold-bg), transparent); break-inside: avoid; }
    .cons-h { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: var(--text); }
    .cons-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 12px 0; }
    .cons-cell { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r8); padding: 12px; }
    .cons-cell.strong { border-color: var(--rim); }
    .cons-lbl { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; margin-bottom: 6px; }
    .cons-val { font-size: 16px; font-weight: 800; }
    .cons-tie { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 6px 0; }
    .cons-tie.ok { color: var(--jade); }
    .cons-tie.bad { color: var(--rose); }

    .skel-wrap { padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
    .skel { height: 96px; border-radius: var(--r8); background: linear-gradient(90deg, var(--raised) 0%, var(--float) 50%, var(--raised) 100%); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .empty { text-align: center; padding: 40px 18px; color: var(--sub); }
    .empty .ico { font-size: 38px; margin-bottom: 10px; opacity: .6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 6px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); max-width: 480px; margin: 0 auto; line-height: 1.6; }

    @media print {
      .no-print, .no-print-flex .seg { display: none !important; }
      .card { border: none; box-shadow: none; padding: 0; }
      .panel, .consolidated { break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .cons-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `,
})
export class Dcpr {
  readonly PAGE = PAGE;

  mode = signal<'day' | 'range'>('day');
  day = signal(todayIso());
  fromDate = signal(todayIso());
  toDate = signal(todayIso());

  report = signal<DcprReport | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  setMode(m: 'day' | 'range') {
    this.mode.set(m);
    if (m === 'range') {
      this.fromDate.set(this.day());
      this.toDate.set(this.day());
    }
  }

  private resolveRange(): { from: string; to: string } {
    return this.mode() === 'day'
      ? { from: this.day(), to: this.day() }
      : { from: this.fromDate(), to: this.toDate() };
  }

  async load() {
    const { from, to } = this.resolveRange();
    if (!from || !to) { this.error.set('Pick a valid date range.'); return; }
    if (from > to) { this.error.set('“From” date must be on or before “To” date.'); return; }

    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase.rpc('rpc_dcpr', { p_date_from: from, p_date_to: to });
    this.loading.set(false);

    if (error) {
      this.error.set(
        error.message?.includes('forbidden')
          ? 'You don’t have access to the DCPR report.'
          : (error.message || 'Failed to load the report.'),
      );
      this.report.set(null);
      return;
    }
    this.report.set(data as DcprReport);
  }

  receiptGroups(acc: DcprAccount): TypeGroup[] { return groupByType(acc.receipts); }
  paymentGroups(acc: DcprAccount): TypeGroup[] { return groupByType(acc.payments); }

  hasActivity(acc: DcprAccount): boolean {
    return acc.receipts.length > 0 || acc.payments.length > 0;
  }

  isEmpty = computed(() => {
    const r = this.report();
    if (!r) return false;
    return r.per_account.every(a => a.receipts.length === 0 && a.payments.length === 0);
  });

  allTie = computed(() => {
    const r = this.report();
    return !!r && r.per_account.every(a => a.ties_to_gl);
  });

  fmtRange(): string {
    const r = this.report();
    if (!r) return '';
    return r.date_from === r.date_to
      ? this.fmtDate(r.date_from)
      : `${this.fmtDate(r.date_from)} – ${this.fmtDate(r.date_to)}`;
  }

  badge(l: DcprLine): string {
    if (l.is_reversal) return 'REVERSAL';
    if (l.is_reversed) return 'REVERSED';
    return '';
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
