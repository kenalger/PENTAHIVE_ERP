import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

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
interface SupplierLite {
  id: string; code: string; name: string;
  bir_registered: boolean; ewt_rate: number; payment_terms: string | null;
}

// ── rpc_canvass_suggestions shape (verified against the live function) ──
interface Quote {
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  bir_registered: boolean;
  ewt_rate: number;          // percent, raw (1.00 = 1%, 0.00 = none)
  payment_terms: string | null;
  unit_price: number;        // raw on canvass basis
  net_unit: number;
  inclusive_unit: number;
  effective: number;         // per award_basis
  responsive: boolean;
  is_suggested: boolean;
}
interface SuggItem {
  item_id: string;
  line_no: number;
  description: string;
  uom: string;
  qty: number;
  suggested_supplier_id: string | null;
  rationale: string;
  quotes: Quote[];
}
interface Suggestions {
  canvass_id: string;
  status: Canvass['status'];
  vat_treatment: Canvass['vat_treatment'];
  award_basis: 'landed' | 'net';
  items: SuggItem[];
}

// winner_supplier_id / winner_reason live on canvass_items, NOT in the suggestions RPC.
interface WinnerRow { item_id: string; winner_supplier_id: string | null; winner_reason: string | null; }

interface AwardedPO { po_id: string; po_no: string; supplier_id: string; total: number; }

const EMPTY_FORM = () => ({
  pr_id: '' as string,
  pr_no: '' as string | null,
  currency: 'PHP',
  vat_treatment: 'vat-inclusive' as Canvass['vat_treatment'],
});

@Component({
  selector: 'app-canvasses',
  imports: [FormsModule, RouterLink, Modal, Icon],
  template: `
    @if (!detail()) {
      <!-- ═══════════════ REGISTER ═══════════════ -->
      <div class="krow k4">
        <div class="kc kc-a"><span class="kc-ico">📋</span><div class="kc-lbl">Open</div><div class="kc-val">{{ kpis().open }}</div><div class="kc-sub">In progress</div></div>
        <div class="kc kc-b"><span class="kc-ico">🛎️</span><div class="kc-lbl">Awaiting Approval</div><div class="kc-val">{{ kpis().awaiting }}</div><div class="kc-sub">Pending review</div></div>
        <div class="kc kc-g"><span class="kc-ico">🏆</span><div class="kc-lbl">Awarded</div><div class="kc-val">{{ kpis().awarded }}</div><div class="kc-sub">Resulted in POs</div></div>
        <div class="kc kc-r"><span class="kc-ico">❌</span><div class="kc-lbl">Closed/Cancelled</div><div class="kc-val">{{ kpis().closed }}</div><div class="kc-sub">Inactive</div></div>
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
              <thead><tr><th>Canvass No.</th><th>Date</th><th>PR Ref</th><th>Currency</th><th>VAT</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (c of rows(); track c.id) {
                  <tr (click)="openDetail(c)">
                    <td class="mono ta">{{ c.no }}</td>
                    <td class="sub mono">{{ c.date }}</td>
                    <td class="mono tb">{{ c.pr_no || '—' }}</td>
                    <td class="mono">{{ c.currency }}</td>
                    <td class="sub">{{ c.vat_treatment.replace('-', ' ') }}</td>
                    <td><span [class]="badgeClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                    <td class="tr"><span class="link">Open AOQ <app-icon name="chevron-right" [size]="13" /></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    } @else {
      <!-- ═══════════════ CANVASS DETAIL / AOQ ═══════════════ -->
      <div class="aoq-top">
        <button class="ph-btn ph-btn-ghost ph-btn-sm noprint" (click)="closeDetail()">
          <app-icon name="arrow-left-right" [size]="14" /> Back to register
        </button>
        <div class="grow"></div>
        <button class="ph-btn ph-btn-ghost ph-btn-sm noprint" (click)="print()"><app-icon name="file-text" [size]="14" /> Print AOQ</button>
      </div>

      <div class="card">
        <div class="aoq-head">
          <div>
            <div class="aoq-title">Abstract of Quotation</div>
            <div class="aoq-no mono">{{ detail()!.no }} <span class="sub">·</span> <span class="sub">{{ detail()!.date }}</span>
              @if (detail()!.pr_no) { <span class="sub">· PR {{ detail()!.pr_no }}</span> }
            </div>
          </div>
          <div class="aoq-chips">
            <span [class]="badgeClass(detail()!.status)">{{ statusLabel(detail()!.status) }}</span>
            @if (sugg(); as s) {
              <span class="bs s-basis" [title]="basisHint(s.award_basis)">
                Basis: {{ s.award_basis === 'landed' ? 'Landed (VAT-incl.)' : 'Net of VAT' }}
              </span>
              <span class="bs s-vat">VAT: {{ s.vat_treatment.replace('-', ' ') }}</span>
            }
          </div>
        </div>

        @if (detailLoading()) {
          <div class="sk-wrap">
            @for (n of [1,2,3]; track n) { <div class="sk-row"></div> }
            <p class="sub" style="text-align:center;margin-top:6px">Loading quotes &amp; suggestions…</p>
          </div>
        }
        @else if (detailError()) {
          <div class="ph-alert ph-alert-error">
            {{ detailError() }}
            <button class="ph-btn ph-btn-ghost ph-btn-sm" style="margin-left:10px" (click)="loadDetail()">Retry</button>
          </div>
        }
        @else if (sugg(); as s) {
          @if (s.items.length === 0) {
            <div class="empty">
              <div class="ico">📭</div>
              <div class="title">No line items on this canvass</div>
              <div class="hint">This canvass header has no items to quote. Items come from the source PR.</div>
            </div>
          } @else if (!hasAnyQuote()) {
            <!-- EMPTY: items exist but nobody has quoted → push them to quote entry -->
            <div class="empty">
              <div class="ico">💬</div>
              <div class="title">No quotes captured yet</div>
              <div class="hint">Invite suppliers and enter their unit prices to build the abstract.</div>
              @if (canEdit()) {
                <button class="ph-btn ph-btn-primary ph-btn-sm" style="margin-top:14px" (click)="openQuoteEntry()">
                  <app-icon name="notebook-pen" [size]="14" /> Enter quotes
                </button>
              }
            </div>
          } @else {
            <!-- POPULATED: the AOQ comparison grid -->
            <div class="aoq-bar noprint">
              <span class="sub">{{ s.items.length }} item(s) · {{ supplierCols().length }} supplier(s) quoting · {{ awardedCount() }}/{{ s.items.length }} winners set</span>
              <div class="grow"></div>
              @if (canEdit() && !isAwarded()) {
                <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="acceptAllSuggestions()" [disabled]="busy()">Accept all suggestions</button>
                <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="openQuoteEntry()"><app-icon name="notebook-pen" [size]="13" /> Edit quotes</button>
              }
            </div>

            <div class="tw aoq-scroll">
              <table class="ph-table aoq-grid">
                <thead>
                  <tr>
                    <th class="col-item">Item</th>
                    @for (sc of supplierCols(); track sc.supplier_id) {
                      <th class="col-sup tr">
                        <div class="sup-name">{{ sc.supplier_name }}</div>
                        <div class="sup-badge mono">
                          {{ sc.bir_registered ? 'BIR' : 'non-VAT' }}
                          @if (sc.ewt_rate > 0) { · EWT {{ sc.ewt_rate }}% }
                          @if (sc.payment_terms) { · {{ sc.payment_terms }} } @else { · COD }
                        </div>
                      </th>
                    }
                    <th class="col-win">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of s.items; track it.item_id) {
                    <tr class="item-row">
                      <td class="col-item">
                        <div class="it-desc">{{ it.line_no }}. {{ it.description }}</div>
                        <div class="it-meta sub mono">{{ fmtQty(it.qty) }} {{ it.uom }}</div>
                      </td>

                      @for (sc of supplierCols(); track sc.supplier_id) {
                        @let q = quoteFor(it, sc.supplier_id);
                        @if (!q) {
                          <td class="cell tr empty-cell" title="Did not quote">—</td>
                        } @else {
                          <td class="cell tr"
                              [class.c-sugg]="q.is_suggested"
                              [class.c-win]="winnerOf(it) === q.supplier_id"
                              [class.c-nonresp]="!q.responsive"
                              [title]="cellTitle(q)">
                            <div class="cell-top">
                              @if (q.is_suggested) { <span class="chip chip-sugg" title="System suggestion">★ Suggested</span> }
                              @if (winnerOf(it) === q.supplier_id && winnerOf(it) !== it.suggested_supplier_id) {
                                <span class="chip chip-win" title="Buyer override">Winner</span>
                              }
                              <span class="price mono">{{ peso(q.unit_price) }}</span>
                            </div>
                            <div class="cell-sub mono">
                              @if (!q.responsive) { <span class="nonresp-tag">not responsive</span> }
                              @else {
                                <span class="sub">net {{ peso(q.net_unit) }} · landed {{ peso(q.inclusive_unit) }}</span>
                              }
                            </div>
                            @if (canEdit() && !isAwarded() && q.responsive) {
                              <button class="pick-btn"
                                      [class.picked]="winnerOf(it) === q.supplier_id"
                                      (click)="pickWinner(it, q)">
                                {{ winnerOf(it) === q.supplier_id ? '✓ Winner' : 'Pick' }}
                              </button>
                            }
                          </td>
                        }
                      }

                      <td class="col-win">
                        @if (winnerOf(it); as w) {
                          <div class="win-name">{{ supplierName(w) }}</div>
                          @if (winnerReasonOf(it); as r) { <div class="win-reason sub" title="Override reason">“{{ r }}”</div> }
                          @else if (w === it.suggested_supplier_id) { <div class="win-reason sub">accepted suggestion</div> }
                        } @else {
                          <span class="bs s-unset">Unset</span>
                        }
                      </td>
                    </tr>
                    <tr class="rationale-row">
                      <td [attr.colspan]="supplierCols().length + 2">
                        <span class="rat-ico">💡</span> <span class="rat-text">{{ it.rationale }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- AWARD / SUMMARY -->
            @if (isAwarded()) {
              <div class="award-summary">
                <div class="as-head"><app-icon name="file-check" [size]="16" /> Awarded — {{ awardedPOs().length }} purchase order(s) created</div>
                <table class="ph-table">
                  <thead><tr><th>PO No.</th><th>Supplier</th><th class="tr">Total</th><th class="noprint"></th></tr></thead>
                  <tbody>
                    @for (po of awardedPOs(); track po.po_id) {
                      <tr>
                        <td class="mono ta">{{ po.po_no }}</td>
                        <td>{{ supplierName(po.supplier_id) }}</td>
                        <td class="mono tr fw6">{{ peso(po.total) }}</td>
                        <td class="tr noprint"><a class="link" [routerLink]="['/', 'milling', 'purchase-orders']" (click)="closeDetail()">View in POs <app-icon name="chevron-right" [size]="12" /></a></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else if (canEdit()) {
              <div class="award-bar noprint">
                @if (awardError()) { <div class="ph-alert ph-alert-error" style="flex:1;margin:0">{{ awardError() }}</div> }
                @else if (!allAwarded()) {
                  <div class="ph-alert ph-alert-warn" style="flex:1;margin:0">
                    ⚠️ Lines {{ unawardedLineNos() }} still need a winner.
                    @if (hasUnquotedLine()) { <span>Lines with no responsive quote can't be picked — <button type="button" class="link" style="border:none;background:none" (click)="openQuoteEntry()">add or fix their quotes</button>.</span> }
                  </div>
                } @else {
                  <div class="ph-alert ph-alert-info" style="flex:1;margin:0">All items have a winner. Awarding creates one PO per winning supplier.</div>
                }
                <button class="ph-btn ph-btn-primary" [disabled]="!allAwarded() || busy()" (click)="award()">
                  {{ busy() ? 'Awarding…' : '🏆 Award & create PO(s)' }}
                </button>
              </div>
            }
          }
        }
      </div>
    }

    <!-- ═══════════════ NEW CANVASS MODAL ═══════════════ -->
    <app-modal [open]="showCreate()" [title]="'New Canvass'" (closed)="closeCreate()">
      <form (ngSubmit)="save()">
        <div class="form-grid">
          <div class="ph-field col-2">
            <label class="ph-label">Source PR</label>
            <select class="ph-select" [(ngModel)]="form.pr_id" name="pr" (change)="onPrChange()">
              <option value="">— None (free-form canvass) —</option>
              @for (p of prOptions(); track p.id) { <option [value]="p.id">{{ p.no }}</option> }
            </select>
            <span class="help">Only PRs in <em>for_canvass</em> status are listed.</span>
          </div>
          <div class="ph-field">
            <label class="ph-label">Currency</label>
            <select class="ph-select" [(ngModel)]="form.currency" name="currency">
              <option value="PHP">PHP</option><option value="USD">USD</option><option value="THB">THB</option><option value="VND">VND</option>
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
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Create canvass' }}</button>
        </div>
      </form>
    </app-modal>

    <!-- ═══════════════ QUOTE ENTRY MODAL ═══════════════ -->
    <app-modal [open]="showQuotes()" [title]="'Quote Entry — ' + (detail()?.no || '')" (closed)="closeQuoteEntry()">
      <p class="sub" style="margin:-4px 0 12px">
        Enter each supplier's unit price per item on the canvass <strong>{{ detail()?.vat_treatment?.replace('-',' ') }}</strong> basis.
        A blank cell means the supplier did not quote that item.
      </p>

      <div class="qe-suppliers">
        <span class="qe-lbl">Suppliers in this canvass:</span>
        @for (s of quoteSuppliers(); track s.id) {
          <span class="qe-chip">{{ s.name }}
            <button type="button" class="qe-x" title="Remove (clears its quotes on save)" (click)="removeQuoteSupplier(s.id)">×</button>
          </span>
        }
        <select class="ph-select qe-add" [(ngModel)]="addSupplierId" name="addsup" (change)="addQuoteSupplier()">
          <option value="">＋ Add supplier…</option>
          @for (s of addableSuppliers(); track s.id) { <option [value]="s.id">{{ s.name }} · {{ s.bir_registered ? 'BIR' : 'non-VAT' }}</option> }
        </select>
      </div>

      @if (quoteSuppliers().length === 0) {
        <div class="ph-alert ph-alert-info">Add at least one supplier to start entering quotes.</div>
      } @else {
        <div class="tw qe-scroll">
          <table class="ph-table qe-grid">
            <thead>
              <tr><th class="col-item">Item</th>
                @for (s of quoteSuppliers(); track s.id) { <th class="tr">{{ s.code }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (it of qeItems(); track it.item_id) {
                <tr>
                  <td class="col-item"><div class="it-desc">{{ it.line_no }}. {{ it.description }}</div><div class="sub mono">{{ fmtQty(it.qty) }} {{ it.uom }}</div></td>
                  @for (s of quoteSuppliers(); track s.id) {
                    <td>
                      <input class="ph-input mono tr qe-cell" type="number" min="0" step="0.01"
                             [ngModel]="qeValue(it.item_id, s.id)"
                             (ngModelChange)="qeSet(it.item_id, s.id, $event)"
                             [name]="'q_' + it.item_id + '_' + s.id" placeholder="—" />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (quoteError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ quoteError() }}</div> }
      <div class="form-actions">
        <button type="button" class="ph-btn ph-btn-ghost" (click)="closeQuoteEntry()">Cancel</button>
        <button type="button" class="ph-btn ph-btn-primary" [disabled]="busy()" (click)="saveQuotes()">{{ busy() ? 'Saving…' : 'Save quotes' }}</button>
      </div>
    </app-modal>

    <!-- ═══════════════ OVERRIDE-REASON MODAL ═══════════════ -->
    <app-modal [open]="showOverride()" [title]="'Override winner'" (closed)="cancelOverride()">
      @if (overrideCtx(); as o) {
        <p class="sub" style="margin:-4px 0 4px">
          Awarding <strong>{{ o.item.line_no }}. {{ o.item.description }}</strong> to <strong>{{ o.quote.supplier_name }}</strong>
          ({{ peso(o.quote.effective) }} effective).
        </p>
        @if (o.deltaTotal > 0) {
          <div class="ph-alert ph-alert-warn" style="margin:8px 0">
            ⚠️ This is <strong>{{ peso(o.deltaTotal) }}</strong> higher than the suggested
            {{ o.suggestedName }} ({{ peso(o.suggestedEff) }} effective × {{ fmtQty(o.item.qty) }} {{ o.item.uom }}).
            Confirm a reason for choosing the costlier quote.
          </div>
        }
        <div class="ph-field">
          <label class="ph-label">Reason for override *</label>
          <textarea class="ph-input" rows="3" [(ngModel)]="overrideReason" name="orsn"
                    placeholder="e.g. supplier reliability, delivery lead time, prior quality issue…"></textarea>
          <span class="help">Required — stored on the canvass item as the audit trail for not taking the suggestion.</span>
        </div>
        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="cancelOverride()">Cancel</button>
          <button type="button" class="ph-btn ph-btn-primary" [disabled]="!overrideReason.trim() || busy()" (click)="confirmOverride()">
            {{ busy() ? 'Saving…' : 'Confirm override' }}
          </button>
        </div>
      }
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
    .grow { flex: 1; }
    .link { color: var(--sky); font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .form-grid .col-3 { grid-column: span 3; }
    .help { font-size: 10.5px; color: var(--dim); }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    /* badges */
    .bs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
    .s-open    { background: var(--gold-bg);  color: var(--gold);  border: 1px solid var(--gold-rim); }
    .s-await   { background: var(--sky-bg);   color: var(--sky);   border: 1px solid var(--sky-rim); }
    .s-award   { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .s-closed  { background: var(--raised);  color: var(--sub); }
    .s-can     { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }
    .s-basis   { background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-rim); }
    .s-vat     { background: var(--teal-bg); color: var(--teal); border: 1px solid var(--teal-rim); }
    .s-unset   { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-rim); }

    /* AOQ shell */
    .aoq-top { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .aoq-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .aoq-title { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -.3px; }
    .aoq-no { font-size: 12px; margin-top: 3px; }
    .aoq-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .aoq-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 11px; }

    .sk-wrap { padding: 8px 0; }
    .sk-row { height: 42px; border-radius: var(--r8); margin-bottom: 8px; background: linear-gradient(90deg, var(--raised) 25%, var(--row-hover) 37%, var(--raised) 63%); background-size: 400% 100%; animation: sk 1.3s ease infinite; }
    @keyframes sk { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

    /* AOQ grid */
    .aoq-scroll { overflow-x: auto; }
    .aoq-grid { min-width: 100%; }
    .aoq-grid th, .aoq-grid td { vertical-align: top; }
    .col-item { min-width: 200px; max-width: 280px; position: sticky; left: 0; background: var(--surface); z-index: 1; }
    .aoq-grid tbody tr:hover .col-item { background: var(--row-hover); }
    .col-sup { min-width: 150px; }
    .col-win { min-width: 150px; }
    .sup-name { font-weight: 700; font-size: 12px; color: var(--text); }
    .sup-badge { font-size: 9.5px; color: var(--sub); margin-top: 2px; text-transform: none; letter-spacing: 0; }
    .it-desc { font-weight: 600; font-size: 12px; color: var(--text); }
    .it-meta { font-size: 10.5px; margin-top: 2px; }

    .item-row td { cursor: default; }
    .cell { padding-bottom: 28px !important; position: relative; }
    .empty-cell { color: var(--dim); }
    .cell-top { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
    .price { font-size: 13px; font-weight: 700; color: var(--text); }
    .cell-sub { font-size: 10px; margin-top: 2px; text-align: right; }
    .nonresp-tag { color: var(--rose); font-style: italic; }
    .c-sugg { background: var(--jade-bg); }
    .c-win  { box-shadow: inset 0 0 0 2px var(--jade-rim); border-radius: var(--r6); }
    .c-nonresp .price { text-decoration: line-through; color: var(--dim); font-weight: 500; }
    .c-nonresp { opacity: .65; }

    .chip { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 20px; font-size: 9.5px; font-weight: 700; letter-spacing: .2px; }
    .chip-sugg { background: var(--jade); color: #04140d; }
    .chip-win  { background: var(--gold); color: #1a1304; }

    .pick-btn { position: absolute; right: 8px; bottom: 6px; font-size: 10px; font-weight: 600; padding: 2px 10px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--sub); cursor: pointer; }
    .pick-btn:hover { border-color: var(--jade-rim); color: var(--jade); }
    .pick-btn.picked { background: var(--jade-bg); border-color: var(--jade-rim); color: var(--jade); }

    .win-name { font-weight: 700; font-size: 12px; color: var(--text); }
    .win-reason { font-size: 10.5px; margin-top: 2px; font-style: italic; }

    .rationale-row td { padding: 6px 12px 12px !important; border-bottom: 1px solid var(--border); background: transparent; cursor: default; }
    .rat-ico { margin-right: 5px; }
    .rat-text { font-size: 11px; color: var(--sub); }

    .award-bar { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
    .award-summary { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
    .as-head { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--jade); margin-bottom: 12px; }

    /* quote-entry modal */
    .qe-suppliers { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    .qe-lbl { font-size: 11px; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .6px; }
    .qe-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px 4px 10px; border-radius: 20px; background: var(--raised); font-size: 11.5px; font-weight: 600; }
    .qe-x { background: none; border: none; color: var(--rose); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .qe-add { max-width: 200px; padding: 6px 8px; font-size: 12px; }
    .qe-scroll { overflow-x: auto; max-height: 50vh; overflow-y: auto; }
    .qe-grid .ph-input { padding: 5px 7px; font-size: 12px; }
    .qe-cell { width: 92px; }

    @media print {
      .noprint { display: none !important; }
      .card { border: none; box-shadow: none; }
      .col-item { position: static; }
      .aoq-scroll { overflow: visible; }
      .item-row, .rationale-row { break-inside: avoid; }
      .pick-btn { display: none; }
    }
  `,
})
export class Canvasses {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  rows = signal<Canvass[]>([]);
  prOptions = signal<PROption[]>([]);
  allSuppliers = signal<SupplierLite[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showCreate = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form = EMPTY_FORM();

  // detail / AOQ state
  detail = signal<Canvass | null>(null);
  detailLoading = signal(false);
  detailError = signal<string | null>(null);
  sugg = signal<Suggestions | null>(null);
  winners = signal<Record<string, WinnerRow>>({});
  awardedPOs = signal<AwardedPO[]>([]);
  busy = signal(false);
  awardError = signal<string | null>(null);

  // quote entry
  showQuotes = signal(false);
  quoteSupplierIds = signal<string[]>([]);
  quoteVals = signal<Record<string, string>>({});   // key `${itemId}|${supplierId}` -> raw input
  private quoteRowIds: Record<string, string> = {};  // existing canvass_quotes.id per cell
  addSupplierId = '';
  quoteError = signal<string | null>(null);

  // override modal
  showOverride = signal(false);
  overrideReason = '';
  overrideCtx = signal<{
    item: SuggItem; quote: Quote; suggestedName: string; suggestedEff: number; deltaTotal: number;
  } | null>(null);

  kpis = computed(() => {
    const r = this.rows();
    return {
      open: r.filter(x => x.status === 'open').length,
      awaiting: r.filter(x => x.status === 'awaiting_approval').length,
      awarded: r.filter(x => x.status === 'awarded').length,
      closed: r.filter(x => x.status === 'closed' || x.status === 'cancelled').length,
    };
  });

  // Supplier columns = distinct suppliers that have a quote on this canvass.
  supplierCols = computed<Quote[]>(() => {
    const s = this.sugg();
    if (!s) return [];
    const seen = new Map<string, Quote>();
    for (const it of s.items) for (const q of it.quotes) if (!seen.has(q.supplier_id)) seen.set(q.supplier_id, q);
    return [...seen.values()].sort((a, b) => a.supplier_code.localeCompare(b.supplier_code));
  });

  quoteSuppliers = computed<SupplierLite[]>(() => {
    const ids = new Set(this.quoteSupplierIds());
    return this.allSuppliers().filter(s => ids.has(s.id)).sort((a, b) => a.code.localeCompare(b.code));
  });
  addableSuppliers = computed<SupplierLite[]>(() => {
    const ids = new Set(this.quoteSupplierIds());
    return this.allSuppliers().filter(s => !ids.has(s.id));
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
<<<<<<< HEAD
    const [c, prs, sup] = await Promise.all([
      supabase.from('canvasses').select('id, no, date, pr_no, currency, vat_treatment, status, created_at').order('created_at', { ascending: false }),
      supabase.from('purchase_requests').select('id, no').eq('status', 'for_canvass').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, code, name, bir_registered, ewt_rate, payment_terms').eq('status', 'active').order('name'),
=======
    const [c, prs] = await Promise.all([
      supabase.from('milling_canvasses').select('id, no, date, pr_no, currency, vat_treatment, status, created_at').order('created_at', { ascending: false }),
      supabase.from('milling_purchase_requests').select('id, no').eq('status', 'for_canvass').order('created_at', { ascending: false }),
>>>>>>> 076d5e0 (udptae)
    ]);
    this.loading.set(false);
    if (c.error) { this.error.set(c.error.message); this.cdr.markForCheck(); return; }
    this.rows.set((c.data ?? []) as Canvass[]);
    this.prOptions.set((prs.data ?? []) as PROption[]);
    this.allSuppliers.set((sup.data ?? []) as SupplierLite[]);
    this.cdr.markForCheck();
  }

  // ── register ↔ detail ──
  openDetail(c: Canvass) { this.detail.set(c); this.loadDetail(); }
  closeDetail() {
    this.detail.set(null);
    this.sugg.set(null);
    this.awardedPOs.set([]);
    this.awardError.set(null);
    this.load();
  }

  async loadDetail() {
    const c = this.detail();
    if (!c) return;
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.awardError.set(null);

    const [sg, win] = await Promise.all([
      supabase.rpc('rpc_canvass_suggestions', { p_canvass_id: c.id }),
      supabase.from('canvass_items').select('id, winner_supplier_id, winner_reason').eq('canvass_id', c.id),
    ]);

    this.detailLoading.set(false);
    if (sg.error) { this.detailError.set(sg.error.message); this.cdr.markForCheck(); return; }
    if (win.error) { this.detailError.set(win.error.message); this.cdr.markForCheck(); return; }

    const s = sg.data as Suggestions;
    this.sugg.set(s);

    const wmap: Record<string, WinnerRow> = {};
    for (const w of (win.data ?? []) as any[]) {
      wmap[w.id] = { item_id: w.id, winner_supplier_id: w.winner_supplier_id, winner_reason: w.winner_reason };
    }
    this.winners.set(wmap);

    if (s.status === 'awarded') await this.loadAwardedPOs(c.id);
    this.cdr.markForCheck();
  }

  private async loadAwardedPOs(canvassId: string) {
    const { data } = await supabase.from('purchase_orders').select('id, no, supplier_id, total').eq('canvass_id', canvassId).order('no');
    this.awardedPOs.set((data ?? []).map((p: any) => ({ po_id: p.id, po_no: p.no, supplier_id: p.supplier_id, total: Number(p.total) })));
    this.cdr.markForCheck();
  }

  // ── grid helpers (methods: they read signals + plain maps) ──
  isAwarded() { return this.sugg()?.status === 'awarded'; }
  canEdit() { return this.auth.canDo('canvasses', 'edit'); }
  quoteFor(it: SuggItem, supplierId: string): Quote | undefined { return it.quotes.find(q => q.supplier_id === supplierId); }
  winnerOf(it: SuggItem): string | null { return this.winners()[it.item_id]?.winner_supplier_id ?? null; }
  winnerReasonOf(it: SuggItem): string | null { return this.winners()[it.item_id]?.winner_reason ?? null; }
  hasAnyQuote() { return (this.sugg()?.items ?? []).some(it => it.quotes.length > 0); }
  awardedCount() { return (this.sugg()?.items ?? []).filter(it => this.winnerOf(it)).length; }
  allAwarded() { const s = this.sugg(); return !!s && s.items.length > 0 && s.items.every(it => this.winnerOf(it)); }
  unawardedLineNos() { return (this.sugg()?.items ?? []).filter(it => !this.winnerOf(it)).map(it => it.line_no).join(', '); }
  hasUnquotedLine() { return (this.sugg()?.items ?? []).some(it => !this.winnerOf(it) && !it.quotes.some(q => q.responsive)); }

  supplierName(id: string | null): string {
    if (!id) return '—';
    const fromSup = this.allSuppliers().find(s => s.id === id);
    if (fromSup) return fromSup.name;
    for (const it of this.sugg()?.items ?? []) { const q = it.quotes.find(x => x.supplier_id === id); if (q) return q.supplier_name; }
    return '—';
  }

  cellTitle(q: Quote): string {
    const terms = q.payment_terms || 'COD';
    const ewt = q.ewt_rate > 0 ? `EWT ${q.ewt_rate}%` : 'no EWT';
    const tax = q.bir_registered ? 'BIR-registered' : 'non-VAT';
    const resp = q.responsive ? '' : ' · NOT responsive (excluded)';
    return `Raw ${this.peso(q.unit_price)} · net ${this.peso(q.net_unit)} · landed ${this.peso(q.inclusive_unit)}\n${tax} · ${ewt} · ${terms}${resp}`;
  }
  basisHint(b: string) {
    return b === 'landed'
      ? 'Landed = VAT-inclusive cash cost (input VAT non-creditable). Ranking is on this.'
      : 'Net = price net of recoverable input VAT. Ranking is on this.';
  }

  // ── winner picking ──
  async pickWinner(it: SuggItem, q: Quote) {
    if (!q.responsive) return;
    const isSuggested = q.supplier_id === it.suggested_supplier_id;
    if (isSuggested) { await this.persistWinner(it.item_id, q.supplier_id, null); return; }

    // Override path: reason required. Soft-confirm if costlier than the suggestion.
    const suggQ = it.quotes.find(x => x.supplier_id === it.suggested_supplier_id);
    const deltaTotal = suggQ ? Math.max(0, (q.effective - suggQ.effective) * Number(it.qty)) : 0;
    this.overrideReason = this.winners()[it.item_id]?.winner_reason ?? '';
    this.overrideCtx.set({
      item: it, quote: q,
      suggestedName: suggQ ? suggQ.supplier_name : '—',
      suggestedEff: suggQ ? suggQ.effective : 0,
      deltaTotal,
    });
    this.showOverride.set(true);
  }

  async confirmOverride() {
    const o = this.overrideCtx();
    const reason = this.overrideReason.trim();
    if (!o || !reason) return;
    await this.persistWinner(o.item.item_id, o.quote.supplier_id, reason);
    this.showOverride.set(false);
    this.overrideCtx.set(null);
    this.overrideReason = '';
  }
  cancelOverride() { this.showOverride.set(false); this.overrideCtx.set(null); this.overrideReason = ''; }

  private async persistWinner(itemId: string, supplierId: string, reason: string | null) {
    this.busy.set(true);
    const { error } = await supabase.from('canvass_items')
      .update({ winner_supplier_id: supplierId, winner_reason: reason }).eq('id', itemId);
    this.busy.set(false);
    if (error) { this.awardError.set('Failed to save winner: ' + error.message); this.cdr.markForCheck(); return; }
    this.winners.update(w => ({ ...w, [itemId]: { item_id: itemId, winner_supplier_id: supplierId, winner_reason: reason } }));
    this.awardError.set(null);
    this.cdr.markForCheck();
  }

  async acceptAllSuggestions() {
    const s = this.sugg();
    if (!s) return;
    const targets = s.items.filter(it => it.suggested_supplier_id && !this.winnerOf(it));
    if (targets.length === 0) return;
    this.busy.set(true);
    for (const it of targets) {
      const { error } = await supabase.from('canvass_items')
        .update({ winner_supplier_id: it.suggested_supplier_id, winner_reason: null }).eq('id', it.item_id);
      if (error) { this.busy.set(false); this.awardError.set('Failed: ' + error.message); this.cdr.markForCheck(); return; }
      this.winners.update(w => ({ ...w, [it.item_id]: { item_id: it.item_id, winner_supplier_id: it.suggested_supplier_id!, winner_reason: null } }));
    }
    this.busy.set(false);
    this.cdr.markForCheck();
  }

  // ── award ──
  async award() {
    const c = this.detail();
    if (!c || !this.allAwarded()) return;
    this.busy.set(true);
    this.awardError.set(null);
    const { data, error } = await supabase.rpc('rpc_award_canvass', { p_canvass_id: c.id });
    this.busy.set(false);
    if (error) { this.awardError.set(error.message); this.cdr.markForCheck(); return; }
    const res = data as { status: Canvass['status']; already_awarded: boolean; purchase_orders: AwardedPO[] };
    this.awardedPOs.set((res.purchase_orders ?? []).map(p => ({ ...p, total: Number(p.total) })));
    this.sugg.update(s => s ? { ...s, status: 'awarded' } : s);
    this.detail.update(d => d ? { ...d, status: 'awarded' } : d);
    this.cdr.markForCheck();
  }

  // ── quote entry ──
  qeItems = computed<SuggItem[]>(() => this.sugg()?.items ?? []);
  private qeKey(itemId: string, supplierId: string) { return `${itemId}|${supplierId}`; }
  qeValue(itemId: string, supplierId: string) { return this.quoteVals()[this.qeKey(itemId, supplierId)] ?? ''; }
  qeSet(itemId: string, supplierId: string, v: any) {
    const key = this.qeKey(itemId, supplierId);
    this.quoteVals.update(m => ({ ...m, [key]: v == null ? '' : String(v) }));
  }

  openQuoteEntry() {
    const s = this.sugg();
    if (!s) return;
    // Seed suppliers + values from existing quotes.
    const ids = this.supplierCols().map(c => c.supplier_id);
    this.quoteSupplierIds.set(ids);
    const vals: Record<string, string> = {};
    this.quoteRowIds = {};
    for (const it of s.items) for (const q of it.quotes) {
      vals[this.qeKey(it.item_id, q.supplier_id)] = String(q.unit_price);
    }
    this.quoteVals.set(vals);
    this.addSupplierId = '';
    this.quoteError.set(null);
    // fetch existing row ids so we update/delete in place (no unique constraint → can't upsert)
    this.loadQuoteRowIds();
    this.showQuotes.set(true);
  }
  closeQuoteEntry() { this.showQuotes.set(false); }

  private async loadQuoteRowIds() {
    const s = this.sugg();
    if (!s) return;
    const itemIds = s.items.map(i => i.item_id);
    if (itemIds.length === 0) return;
    const { data } = await supabase.from('canvass_quotes').select('id, canvass_item_id, supplier_id').in('canvass_item_id', itemIds);
    const map: Record<string, string> = {};
    for (const r of (data ?? []) as any[]) map[this.qeKey(r.canvass_item_id, r.supplier_id)] = r.id;
    this.quoteRowIds = map;
  }

  addQuoteSupplier() {
    if (!this.addSupplierId) return;
    const id = this.addSupplierId;
    this.quoteSupplierIds.update(ids => ids.includes(id) ? ids : [...ids, id]);
    this.addSupplierId = '';
  }
  removeQuoteSupplier(id: string) {
    this.quoteSupplierIds.update(ids => ids.filter(x => x !== id));
    // clear that supplier's entered values so save() will delete its rows
    this.quoteVals.update(m => {
      const next = { ...m };
      for (const it of this.sugg()?.items ?? []) delete next[this.qeKey(it.item_id, id)];
      return next;
    });
  }

  async saveQuotes() {
    const s = this.sugg();
    if (!s) return;
    this.busy.set(true);
    this.quoteError.set(null);

    const supIds = this.quoteSupplierIds();
    const inserts: any[] = [];
    const updates: { id: string; unit_price: number }[] = [];
    const deletes: string[] = [];

    for (const it of s.items) for (const sid of supIds) {
      const key = this.qeKey(it.item_id, sid);
      const raw = (this.quoteVals()[key] ?? '').toString().trim();
      const existingId = this.quoteRowIds[key];
      const num = raw === '' ? null : Number(raw);

      if (num == null || isNaN(num)) {
        if (existingId) deletes.push(existingId);            // blank = did not quote → drop row
      } else if (existingId) {
        updates.push({ id: existingId, unit_price: num });
      } else {
        inserts.push({ canvass_item_id: it.item_id, supplier_id: sid, unit_price: num });
      }
    }
    // suppliers removed from the panel: delete all their rows
    const keptSup = new Set(supIds);
    for (const key in this.quoteRowIds) {
      const sid = key.split('|')[1];
      if (!keptSup.has(sid) && !deletes.includes(this.quoteRowIds[key])) deletes.push(this.quoteRowIds[key]);
    }

    try {
      if (deletes.length) { const { error } = await supabase.from('canvass_quotes').delete().in('id', deletes); if (error) throw error; }
      for (const u of updates) { const { error } = await supabase.from('canvass_quotes').update({ unit_price: u.unit_price }).eq('id', u.id); if (error) throw error; }
      if (inserts.length) { const { error } = await supabase.from('canvass_quotes').insert(inserts); if (error) throw error; }
    } catch (e: any) {
      this.busy.set(false);
      this.quoteError.set(e?.message || 'Failed to save quotes.');
      this.cdr.markForCheck();
      return;
    }

    this.busy.set(false);
    this.showQuotes.set(false);
    await this.loadDetail();   // re-suggest with new quotes
  }

  // ── new canvass (unchanged behavior) ──
  openCreate() { this.form = EMPTY_FORM(); this.formError.set(null); this.showCreate.set(true); }
  closeCreate() { this.showCreate.set(false); }
  onPrChange() { const pr = this.prOptions().find(p => p.id === this.form.pr_id); this.form.pr_no = pr?.no ?? null; }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const { data: noData, error: noErr } = await supabase.rpc('next_doc_no', { p_series: 'CNV' });
<<<<<<< HEAD
    if (noErr || !noData) { this.formError.set(noErr?.message || 'Failed to generate canvass number'); this.saving.set(false); this.cdr.markForCheck(); return; }
    const { error } = await supabase.from('canvasses').insert({
      no: noData as string, pr_id: this.form.pr_id || null, pr_no: this.form.pr_no,
      currency: this.form.currency, vat_treatment: this.form.vat_treatment,
=======
    if (noErr || !noData) {
      this.formError.set(noErr?.message || 'Failed to generate canvass number');
      this.saving.set(false);
      return;
    }
    const { error } = await supabase.from('milling_canvasses').insert({
      no: noData as string,
      pr_id: this.form.pr_id || null,
      pr_no: this.form.pr_no,
      currency: this.form.currency,
      vat_treatment: this.form.vat_treatment,
>>>>>>> 076d5e0 (udptae)
    });
    this.saving.set(false);
    if (error) { this.formError.set(error.message); this.cdr.markForCheck(); return; }
    this.closeCreate();
    await this.load();
  }

  print() { window.print(); }

  // ── formatting ──
  peso(n: number) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  fmtQty(n: number) { return Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 }); }

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
