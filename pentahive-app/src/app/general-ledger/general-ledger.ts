import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../supabase.client';
import { Icon } from '../ui/icon';

/**
 * Read-only General Ledger viewer.
 *
 * Two tabs over two ready-made read-only views (RLS auto-applies):
 *  - Journal Register: v_journal_register (one row per LINE) grouped by entry.
 *  - Account Ledger:   v_account_ledger   (per-account running_balance).
 *
 * The ledger query MUST be ordered the same way the view computed
 * running_balance — PARTITION BY account_id ORDER BY entry_date, entry_no,
 * line_no — or the balance column reads as non-monotonic garbage.
 */

const PAGE = 'general-ledger';

interface RegisterLine {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  source_table: string;
  entry_memo: string | null;
  line_no: number;
  account_id: number;
  acc_code: number;
  acc_name: string;
  debit: number;
  credit: number;
  line_memo: string | null;
}

interface RegisterEntry {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  source_table: string;
  entry_memo: string | null;
  lines: RegisterLine[];
  totalDr: number;
  totalCr: number;
}

interface LedgerRow {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  source_table: string;
  line_no: number;
  debit: number;
  credit: number;
  line_memo: string | null;
  running_balance: number;
}

interface AccountOption {
  id: number;
  acc_code: number;
  acc_name: string;
  side: 'DEBIT' | 'CREDIT';
}

const SOURCE_LABELS: Record<string, string> = {
  weighbridge: 'Weighbridge',
  weighbridge_tickets: 'Weighbridge',
  vendos: 'Vendo',
  vendo: 'Vendo',
  goods_receipts: 'Goods Receipt',
  goods_receipt: 'Goods Receipt',
  purchase_orders: 'Purchase Order',
  sales_orders: 'Sales Order',
  deliveries: 'Delivery',
  milling: 'Milling',
  milling_runs: 'Milling Run',
  inventory: 'Inventory',
  manual: 'Manual',
  manual_journal: 'Manual Journal',
  payroll: 'Payroll',
};

function humanizeSource(src: string | null): string {
  if (!src) return '—';
  const mapped = SOURCE_LABELS[src.toLowerCase()];
  if (mapped) return mapped;
  return src
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

@Component({
  selector: 'app-general-ledger',
  imports: [FormsModule, Icon],
  template: `
    <!-- KPIs -->
    <div class="krow k4">
      <div class="kc kc-b">
        <span class="kc-ico">📒</span>
        <div class="kc-lbl">Journal Entries</div>
        <div class="kc-val">{{ kpis().entries }}</div>
        <div class="kc-sub">{{ kpis().reversals }} reversal{{ kpis().reversals === 1 ? '' : 's' }}</div>
      </div>
      <div class="kc kc-sky">
        <span class="kc-ico">➕</span>
        <div class="kc-lbl">Total Debits</div>
        <div class="kc-val mn">{{ peso(kpis().totalDr) }}</div>
        <div class="kc-sub">Dr movement across all entries</div>
      </div>
      <div class="kc kc-vio">
        <span class="kc-ico">➖</span>
        <div class="kc-lbl">Total Credits</div>
        <div class="kc-val mn">{{ peso(kpis().totalCr) }}</div>
        <div class="kc-sub">Cr movement across all entries</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">🧾</span>
        <div class="kc-lbl">Accounts Touched</div>
        <div class="kc-val">{{ kpis().accountsTouched }}</div>
        <div class="kc-sub">Distinct accounts with postings</div>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <div class="card-t">General Ledger</div>
        <div class="seg" role="tablist" aria-label="Ledger views">
          <button class="seg-btn" type="button" role="tab" [attr.aria-selected]="tab() === 'register'"
                  [class.on]="tab() === 'register'" (click)="tab.set('register')">
            <app-icon name="book-open" [size]="14" /> Journal Register
          </button>
          <button class="seg-btn" type="button" role="tab" [attr.aria-selected]="tab() === 'ledger'"
                  [class.on]="tab() === 'ledger'" (click)="tab.set('ledger')">
            <app-icon name="library" [size]="14" /> Account Ledger
          </button>
        </div>
      </div>

      <!-- ═══════════════ JOURNAL REGISTER ═══════════════ -->
      @if (tab() === 'register') {
        <div class="toolbar">
          <div class="search">
            <app-icon name="search" [size]="14" />
            <input class="search-in" type="search" placeholder="Search entry no, account, memo…"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" name="gl-search"
                   aria-label="Search journal register" />
          </div>
          <label class="fld">
            <span class="fld-l">From</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="fromDate()"
                   (ngModelChange)="fromDate.set($event)" name="gl-from" aria-label="From date" />
          </label>
          <label class="fld">
            <span class="fld-l">To</span>
            <input class="ph-input ph-input-sm mono" type="date" [ngModel]="toDate()"
                   (ngModelChange)="toDate.set($event)" name="gl-to" aria-label="To date" />
          </label>
          <label class="fld">
            <span class="fld-l">Source</span>
            <select class="ph-select ph-input-sm" [ngModel]="sourceFilter()"
                    (ngModelChange)="sourceFilter.set($event)" name="gl-source" aria-label="Filter by source">
              <option value="">All sources</option>
              @for (s of sourceOptions(); track s.value) {
                <option [value]="s.value">{{ s.label }}</option>
              }
            </select>
          </label>
          @if (hasActiveFilters()) {
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="clearFilters()">Clear</button>
          }
          @if (filteredEntries().length > 0) {
            <span class="count-tag">{{ filteredEntries().length }} of {{ entries().length }} entries</span>
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="toggleAllEntries()">
              {{ allExpanded() ? 'Collapse all' : 'Expand all' }}
            </button>
          }
        </div>

        @if (loading()) {
          <div class="skel-wrap">
            @for (s of [1,2,3,4,5]; track s) { <div class="skel"></div> }
          </div>
        } @else if (error()) {
          <div class="ph-alert ph-alert-error">
            {{ error() }}
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="load()" style="margin-left:10px">Retry</button>
          </div>
        } @else if (entries().length === 0) {
          <div class="empty">
            <div class="ico">📭</div>
            <div class="title">No journal entries yet</div>
            <div class="hint">
              The ledger is posted automatically by source documents — when a
              <strong>Weighbridge ticket</strong>, <strong>Goods Receipt</strong> or <strong>Vendo</strong>
              is finalized, its balanced journal entry appears here.
            </div>
          </div>
        } @else if (filteredEntries().length === 0) {
          <div class="empty">
            <div class="ico">🔍</div>
            <div class="title">No entries match your filters</div>
            <div class="hint">
              Try a wider date range or a different source —
              <button class="linkbtn" type="button" (click)="clearFilters()">clear all filters</button>.
            </div>
          </div>
        } @else {
          <div class="reg">
            @for (e of filteredEntries(); track e.entry_id) {
              <div class="entry" [class.is-rev]="e.entry_type === 'reversal'">
                <button class="entry-h" type="button" (click)="toggleEntry(e.entry_id)"
                        [attr.aria-expanded]="isEntryOpen(e.entry_id)"
                        [attr.aria-label]="'Toggle lines for entry ' + e.entry_no">
                  <app-icon [name]="isEntryOpen(e.entry_id) ? 'chevron-down' : 'chevron-right'" [size]="15" />
                  <span class="e-no mono">{{ e.entry_no }}</span>
                  <span class="e-date mono">{{ fmtDate(e.entry_date) }}</span>
                  <span class="src-pill" [class]="sourcePillClass(e.source_table)">{{ humanize(e.source_table) }}</span>
                  @if (e.entry_type === 'reversal') {
                    <span class="rev-badge"><app-icon name="arrow-left-right" [size]="11" /> Reversal</span>
                  }
                  <span class="e-memo">{{ e.entry_memo || '—' }}</span>
                  <span class="spacer"></span>
                  <span class="e-total mono">{{ peso(e.totalDr) }}</span>
                  <span class="e-lc">{{ e.lines.length }} {{ e.lines.length === 1 ? 'line' : 'lines' }}</span>
                </button>

                @if (isEntryOpen(e.entry_id)) {
                  <div class="lines">
                    <table class="mini">
                      <thead>
                        <tr>
                          <th class="c-acc">Account</th>
                          <th class="c-memo">Memo</th>
                          <th class="c-amt tr">Debit</th>
                          <th class="c-amt tr">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (l of e.lines; track l.line_no) {
                          <tr>
                            <td class="c-acc">
                              <span class="acc-code mono">{{ pad(l.acc_code) }}</span>
                              <span class="acc-name">{{ l.acc_name }}</span>
                            </td>
                            <td class="c-memo sub">{{ l.line_memo || '—' }}</td>
                            <td class="c-amt tr mono dr">{{ l.debit ? peso(l.debit) : '' }}</td>
                            <td class="c-amt tr mono cr">{{ l.credit ? peso(l.credit) : '' }}</td>
                          </tr>
                        }
                      </tbody>
                      <tfoot>
                        <tr class="tot">
                          <td class="c-acc">Total</td>
                          <td class="c-memo"></td>
                          <td class="c-amt tr mono dr">{{ peso(e.totalDr) }}</td>
                          <td class="c-amt tr mono cr">{{ peso(e.totalCr) }}</td>
                        </tr>
                        <tr class="bal">
                          <td colspan="4">
                            <app-icon name="check" [size]="12" /> Balanced — debits equal credits
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      <!-- ═══════════════ ACCOUNT LEDGER ═══════════════ -->
      @if (tab() === 'ledger') {
        <div class="toolbar">
          <label class="fld">
            <span class="fld-l">Find account</span>
            <div class="search">
              <app-icon name="search" [size]="14" />
              <input class="search-in" type="search" placeholder="Filter by code or name…"
                     [ngModel]="accountQuery()" (ngModelChange)="accountQuery.set($event)"
                     name="gl-acct-search" aria-label="Filter accounts" />
            </div>
          </label>
          <label class="fld fld-grow">
            <span class="fld-l">Account</span>
            <select class="ph-select ph-input-sm" [ngModel]="selectedAccountId()"
                    (ngModelChange)="onSelectAccount($event)" name="gl-account"
                    aria-label="Select an account">
              <option [ngValue]="null">
                {{ accountQuery().trim() ? (filteredAccounts().length + ' match' + (filteredAccounts().length === 1 ? '' : 'es') + ' — select one') : '— Select an account —' }}
              </option>
              @for (a of filteredAccounts(); track a.id) {
                <option [ngValue]="a.id">{{ pad(a.acc_code) }} · {{ a.acc_name }}</option>
              }
            </select>
          </label>
          @if (selectedAccount(); as acc) {
            <div class="acc-head">
              <span class="acc-head-name">{{ acc.acc_name }}</span>
              <span class="side-pill" [class.s-debit]="acc.side === 'DEBIT'" [class.s-credit]="acc.side === 'CREDIT'">
                {{ acc.side }} normal
              </span>
            </div>
          }
        </div>

        @if (accountsError()) {
          <div class="ph-alert ph-alert-error">
            Couldn't load accounts: {{ accountsError() }}
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="loadAccounts()" style="margin-left:10px">Retry</button>
          </div>
        } @else if (accountsLoading()) {
          <p class="sub" style="padding:12px 0">Loading accounts…</p>
        } @else if (selectedAccountId() === null) {
          <div class="empty">
            <div class="ico">📖</div>
            <div class="title">Pick an account to view its ledger</div>
            <div class="hint">Choose a postable account above to see every posting against it over time, with a running balance.</div>
          </div>
        } @else if (ledgerLoading()) {
          <div class="skel-wrap">
            @for (s of [1,2,3,4,5]; track s) { <div class="skel"></div> }
          </div>
        } @else if (ledgerError()) {
          <div class="ph-alert ph-alert-error">
            {{ ledgerError() }}
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="loadLedger()" style="margin-left:10px">Retry</button>
          </div>
        } @else if (ledgerRows().length === 0) {
          <div class="empty">
            <div class="ico">🗒️</div>
            <div class="title">No postings for this account yet</div>
            <div class="hint">This account exists in the chart of accounts but hasn't been touched by any journal entry.</div>
          </div>
        } @else {
          <div class="tw">
            <table class="ph-table led">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Source</th>
                  <th>Memo</th>
                  <th class="tr">Debit</th>
                  <th class="tr">Credit</th>
                  <th class="tr">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (r of ledgerRows(); track r.entry_id + '-' + r.line_no) {
                  <tr [class.is-rev]="r.entry_type === 'reversal'">
                    <td class="mono">{{ fmtDate(r.entry_date) }}</td>
                    <td class="mono ta">{{ r.entry_no }}</td>
                    <td>
                      <span class="src-pill" [class]="sourcePillClass(r.source_table)">{{ humanize(r.source_table) }}</span>
                      @if (r.entry_type === 'reversal') {
                        <span class="rev-badge sm"><app-icon name="arrow-left-right" [size]="10" /></span>
                      }
                    </td>
                    <td class="sub">{{ r.line_memo || '—' }}</td>
                    <td class="tr mono dr">{{ r.debit ? peso(r.debit) : '' }}</td>
                    <td class="tr mono cr">{{ r.credit ? peso(r.credit) : '' }}</td>
                    <td class="tr mono bal-val" [class.neg]="r.running_balance < 0">{{ pesoSigned(r.running_balance) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="tot">
                  <td colspan="4">Period total · {{ ledgerRows().length }} {{ ledgerRows().length === 1 ? 'line' : 'lines' }}</td>
                  <td class="tr mono dr">{{ peso(ledgerTotals().dr) }}</td>
                  <td class="tr mono cr">{{ peso(ledgerTotals().cr) }}</td>
                  <td class="tr mono bal-val" [class.neg]="ledgerTotals().bal < 0">{{ pesoSigned(ledgerTotals().bal) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="legend">
            <span class="dr">Debit</span> / <span class="cr">Credit</span> follow the COA color language ·
            running balance is <span class="mono">Dr − Cr</span> cumulative for this account
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; }

    /* KPI cards */
    .kc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12); padding: 20px; position: relative; overflow: hidden; }
    .kc::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kc-b::after  { background: linear-gradient(90deg, var(--gold), transparent); }
    .kc-sky::after { background: linear-gradient(90deg, var(--sky), transparent); }
    .kc-vio::after { background: linear-gradient(90deg, var(--violet), transparent); }
    .kc-g::after  { background: linear-gradient(90deg, var(--jade), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; font-variant-numeric: tabular-nums; }
    .kc-val.mn { font-size: 20px; }
    .kc-sub { font-size: 11px; color: var(--sub); }

    /* Segmented control */
    .seg { display: inline-flex; gap: 4px; background: var(--raised); border: 1px solid var(--border); border-radius: var(--r8); padding: 3px; }
    .seg-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--sub); font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: var(--r6); cursor: pointer; font-family: var(--font); white-space: nowrap; }
    .seg-btn:hover { color: var(--text); }
    .seg-btn.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(15,23,42,.08); }

    /* Toolbar */
    .toolbar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
    .search { position: relative; display: inline-flex; align-items: center; }
    .search app-icon { position: absolute; left: 9px; color: var(--dim); pointer-events: none; }
    .search-in { padding: 6px 10px 6px 28px; min-width: 240px; background: var(--raised); border: 1px solid var(--rim); border-radius: var(--r6); color: var(--text); font-size: 12px; font-family: var(--font); }
    .search-in:focus { outline: none; border-color: var(--mist); }
    .fld { display: flex; flex-direction: column; gap: 3px; }
    .fld-grow { flex: 1; min-width: 260px; }
    .fld-l { font-size: 9.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    .ph-input-sm { padding: 6px 10px; font-size: 12px; }
    .count-tag { font-size: 11px; color: var(--dim); margin-left: auto; }
    .acc-head { display: inline-flex; align-items: center; gap: 10px; padding-bottom: 6px; }
    .acc-head-name { font-size: 14px; font-weight: 700; color: var(--text); }
    .side-pill { font-size: 9.5px; font-weight: 800; letter-spacing: .4px; padding: 2px 8px; border-radius: 10px; }
    .s-debit  { background: var(--sky-bg); color: var(--sky); }
    .s-credit { background: var(--violet-bg); color: var(--violet); }

    /* Register */
    .reg { display: flex; flex-direction: column; gap: 8px; }
    .entry { border: 1px solid var(--border); border-radius: var(--r8); overflow: hidden; background: var(--surface); }
    .entry.is-rev { border-color: var(--amber-bg); background: var(--amber-bg); }
    .entry-h { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: transparent; border: none; cursor: pointer; text-align: left; font-family: var(--font); color: var(--text); }
    .entry-h:hover { background: var(--row-hover); }
    .e-no { font-size: 12.5px; font-weight: 700; color: var(--gold); flex-shrink: 0; }
    .e-date { font-size: 11.5px; color: var(--sub); flex-shrink: 0; }
    .src-pill { font-size: 9.5px; font-weight: 700; letter-spacing: .3px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; background: var(--float); color: var(--sub); }
    .sp-jade { background: var(--jade-bg); color: var(--jade); }
    .sp-sky  { background: var(--sky-bg); color: var(--sky); }
    .sp-violet { background: var(--violet-bg); color: var(--violet); }
    .sp-amber { background: var(--amber-bg); color: var(--amber); }
    .rev-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 800; letter-spacing: .3px; color: var(--amber); background: var(--amber-bg); padding: 2px 8px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; }
    .rev-badge.sm { padding: 2px 5px; }
    .e-memo { font-size: 12px; color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
    .spacer { flex: 1; }
    .e-total { font-size: 13px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .e-lc { font-size: 10.5px; color: var(--dim); width: 56px; text-align: right; flex-shrink: 0; }

    .lines { padding: 0 14px 12px; border-top: 1px solid var(--border); background: var(--raised); }
    table.mini { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .mini th { font-size: 9.5px; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; padding: 6px 10px; text-align: left; }
    .mini td { padding: 7px 10px; font-size: 12px; color: var(--text); border-top: 1px solid var(--row-border); }
    .mini .c-acc { display: flex; align-items: center; gap: 8px; }
    .mini tfoot .c-acc { display: table-cell; }
    .acc-code { font-size: 11px; color: var(--gold); background: var(--gold-bg); padding: 1px 6px; border-radius: var(--r4); }
    .acc-name { font-weight: 500; }
    .c-amt { width: 140px; }
    .c-memo { color: var(--sub); }
    .dr { color: var(--sky); }
    .cr { color: var(--violet); }
    .mini tfoot .tot td { border-top: 2px solid var(--rim); font-weight: 800; font-size: 12.5px; }
    .mini tfoot .bal td { padding-top: 4px; border-top: none; font-size: 10.5px; color: var(--jade); display: flex; align-items: center; gap: 5px; }

    .tr { text-align: right; }
    .ta { color: var(--gold); }
    .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }

    /* Ledger table */
    .ph-table.led td, .ph-table.led th { white-space: nowrap; }
    .ph-table.led tbody tr { cursor: default; }
    .ph-table.led tbody tr.is-rev { background: var(--amber-bg); }
    .bal-val { font-weight: 700; }
    .bal-val.neg { color: var(--rose); }
    .led tfoot .tot td { border-top: 2px solid var(--rim); font-weight: 800; padding: 12px 14px; }
    .led tfoot .tot td.dr { color: var(--sky); }
    .led tfoot .tot td.cr { color: var(--violet); }

    .legend { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--dim); }
    .legend .dr { color: var(--sky); font-weight: 700; }
    .legend .cr { color: var(--violet); font-weight: 700; }

    /* Skeleton + empty */
    .skel-wrap { padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
    .skel { height: 44px; border-radius: var(--r8); background: linear-gradient(90deg, var(--raised) 0%, var(--float) 50%, var(--raised) 100%); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .empty { text-align: center; padding: 40px 18px; color: var(--sub); }
    .empty .ico { font-size: 38px; margin-bottom: 10px; opacity: .6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 6px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); max-width: 480px; margin: 0 auto; line-height: 1.6; }
    .linkbtn { background: none; border: none; color: var(--sky); cursor: pointer; font-size: inherit; padding: 0; text-decoration: underline; }

    @media print {
      .toolbar, .seg, .kc-ico { display: none; }
      .entry { break-inside: avoid; }
      .card { border: none; box-shadow: none; }
    }
    @media (max-width: 820px) {
      .e-memo { display: none; }
      .toolbar { align-items: stretch; }
      .count-tag { margin-left: 0; }
    }
  `,
})
export class GeneralLedger {
  readonly PAGE = PAGE;

  tab = signal<'register' | 'ledger'>('register');

  // ── Register state ──
  lines = signal<RegisterLine[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  query = signal('');
  fromDate = signal('');
  toDate = signal('');
  sourceFilter = signal('');
  openEntries = signal<Set<string>>(new Set());

  // ── Ledger state ──
  accounts = signal<AccountOption[]>([]);
  accountsLoading = signal(true);
  accountsError = signal<string | null>(null);
  accountQuery = signal('');
  selectedAccountId = signal<number | null>(null);
  ledgerRows = signal<LedgerRow[]>([]);
  ledgerLoading = signal(false);
  ledgerError = signal<string | null>(null);

  // ── Derived: group lines into balanced entries ──
  entries = computed<RegisterEntry[]>(() => {
    const byEntry = new Map<string, RegisterEntry>();
    for (const l of this.lines()) {
      let e = byEntry.get(l.entry_id);
      if (!e) {
        e = {
          entry_id: l.entry_id, entry_no: l.entry_no, entry_date: l.entry_date,
          entry_type: l.entry_type, source_table: l.source_table, entry_memo: l.entry_memo,
          lines: [], totalDr: 0, totalCr: 0,
        };
        byEntry.set(l.entry_id, e);
      }
      e.lines.push(l);
      e.totalDr += Number(l.debit) || 0;
      e.totalCr += Number(l.credit) || 0;
    }
    const out = [...byEntry.values()];
    for (const e of out) e.lines.sort((a, b) => a.line_no - b.line_no);
    out.sort((a, b) =>
      b.entry_date.localeCompare(a.entry_date) || b.entry_no.localeCompare(a.entry_no));
    return out;
  });

  sourceOptions = computed(() => {
    const seen = new Set<string>();
    for (const e of this.entries()) if (e.source_table) seen.add(e.source_table);
    return [...seen]
      .map(value => ({ value, label: humanizeSource(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  filteredEntries = computed<RegisterEntry[]>(() => {
    const q = this.query().trim().toLowerCase();
    const from = this.fromDate();
    const to = this.toDate();
    const src = this.sourceFilter();
    return this.entries().filter(e => {
      if (src && e.source_table !== src) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      if (q) {
        const hit =
          e.entry_no.toLowerCase().includes(q) ||
          (e.entry_memo ?? '').toLowerCase().includes(q) ||
          humanizeSource(e.source_table).toLowerCase().includes(q) ||
          e.lines.some(l =>
            l.acc_name.toLowerCase().includes(q) ||
            String(l.acc_code).includes(q) ||
            (l.line_memo ?? '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  });

  hasActiveFilters = computed(() =>
    !!(this.query().trim() || this.fromDate() || this.toDate() || this.sourceFilter()));

  kpis = computed(() => {
    const es = this.entries();
    let totalDr = 0, totalCr = 0, reversals = 0;
    const accts = new Set<number>();
    for (const e of es) {
      totalDr += e.totalDr;
      totalCr += e.totalCr;
      if (e.entry_type === 'reversal') reversals++;
      for (const l of e.lines) accts.add(l.account_id);
    }
    return { entries: es.length, totalDr, totalCr, reversals, accountsTouched: accts.size };
  });

  allExpanded = computed(() => {
    const ids = this.filteredEntries();
    return ids.length > 0 && ids.every(e => this.openEntries().has(e.entry_id));
  });

  filteredAccounts = computed<AccountOption[]>(() => {
    const q = this.accountQuery().trim().toLowerCase();
    if (!q) return this.accounts();
    return this.accounts().filter(a =>
      a.acc_name.toLowerCase().includes(q) ||
      String(a.acc_code).includes(q) ||
      this.pad(a.acc_code).includes(q));
  });

  selectedAccount = computed<AccountOption | null>(() => {
    const id = this.selectedAccountId();
    return id === null ? null : this.accounts().find(a => a.id === id) ?? null;
  });

  ledgerTotals = computed(() => {
    let dr = 0, cr = 0;
    for (const r of this.ledgerRows()) { dr += Number(r.debit) || 0; cr += Number(r.credit) || 0; }
    return { dr, cr, bal: dr - cr };
  });

  constructor() {
    this.load();
    this.loadAccounts();
  }

  // ── Register load ──
  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('v_journal_register')
      .select('entry_id, entry_no, entry_date, entry_type, source_table, entry_memo, line_no, account_id, acc_code, acc_name, debit, credit, line_memo')
      .order('entry_date', { ascending: false })
      .order('entry_no', { ascending: false })
      .order('line_no', { ascending: true })
      .limit(2000);
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.lines.set((data ?? []) as RegisterLine[]);
  }

  // ── Accounts (for ledger picker) — sourced from acc_titles, not the empty view ──
  async loadAccounts() {
    this.accountsLoading.set(true);
    this.accountsError.set(null);
    const { data, error } = await supabase
      .from('acc_titles')
      .select('id, acc_code, acc_name, side')
      .eq('is_active', true)
      .order('acc_code', { ascending: true });
    this.accountsLoading.set(false);
    if (error) { this.accountsError.set(error.message); return; }
    this.accounts.set((data ?? []) as AccountOption[]);
  }

  onSelectAccount(id: number | null) {
    this.selectedAccountId.set(id);
    this.ledgerRows.set([]);
    this.ledgerError.set(null);
    if (id !== null) this.loadLedger();
  }

  // Order identically to the view's window (entry_date, entry_no, line_no)
  // so running_balance reads monotonically top-to-bottom.
  async loadLedger() {
    const id = this.selectedAccountId();
    if (id === null) return;
    this.ledgerLoading.set(true);
    this.ledgerError.set(null);
    const { data, error } = await supabase
      .from('v_account_ledger')
      .select('entry_id, entry_no, entry_date, entry_type, source_table, line_no, debit, credit, line_memo, running_balance')
      .eq('account_id', id)
      .order('entry_date', { ascending: true })
      .order('entry_no', { ascending: true })
      .order('line_no', { ascending: true })
      .limit(2000);
    this.ledgerLoading.set(false);
    if (error) { this.ledgerError.set(error.message); return; }
    this.ledgerRows.set((data ?? []) as LedgerRow[]);
  }

  // ── Expand / collapse ──
  isEntryOpen(id: string) { return this.openEntries().has(id); }
  toggleEntry(id: string) {
    const next = new Set(this.openEntries());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.openEntries.set(next);
  }
  toggleAllEntries() {
    if (this.allExpanded()) {
      this.openEntries.set(new Set());
    } else {
      this.openEntries.set(new Set(this.filteredEntries().map(e => e.entry_id)));
    }
  }

  clearFilters() {
    this.query.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.sourceFilter.set('');
  }

  // ── Labels / formatting ──
  humanize(src: string | null) { return humanizeSource(src); }
  sourcePillClass(src: string | null) {
    const h = (src ?? '').toLowerCase();
    if (h.includes('weighbridge')) return 'sp-jade';
    if (h.includes('vendo')) return 'sp-sky';
    if (h.includes('goods') || h.includes('receipt') || h.includes('purchase')) return 'sp-amber';
    if (h.includes('sales') || h.includes('deliver')) return 'sp-violet';
    return '';
  }
  pad(code: number) { return String(code).padStart(3, '0'); }
  fmtDate(d: string) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
  }
  peso(n: number) {
    return '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  pesoSigned(n: number) {
    const v = Number(n) || 0;
    return (v < 0 ? '-₱' : '₱') + (Math.round(Math.abs(v) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
