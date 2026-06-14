import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Modal } from '../ui/modal';
import { Icon } from '../ui/icon';

const PAGE = 'chart-of-accounts';

type GroupType = 'REAL' | 'NOMINAL' | 'FINANCIAL';
type Side = 'DEBIT' | 'CREDIT';
type CfCat = 'NONE' | 'OPERATING' | 'INVESTING' | 'FINANCING';
type Subsidiary = 'BANK' | 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE';
type Level = 'group' | 'class' | 'subclass' | 'title';

const SUBSIDIARIES: Subsidiary[] = ['BANK', 'CUSTOMER', 'SUPPLIER', 'EMPLOYEE'];
const CF_CATS: CfCat[] = ['NONE', 'OPERATING', 'INVESTING', 'FINANCING'];

interface Title {
  id: number;
  acc_name: string;
  acc_code: number;
  side: Side;
  subsidiary: Subsidiary[] | null;
  is_active: boolean;
}
interface Subclass {
  id: number;
  subclass_name: string;
  side: Side;
  cf_category: CfCat;
  prefix: string;
  sequence_no: number;
  is_active: boolean;
  titles: Title[];
}
interface Klass {
  id: number;
  class_name: string;
  sequence_no: number;
  is_active: boolean;
  subclasses: Subclass[];
}
interface Group {
  id: number;
  group_name: string;
  type: GroupType;
  type_sequence: number;
  is_active: boolean;
  classes: Klass[];
}

interface FormState {
  level: Level;
  editingId: number | null;
  // group
  group_name: string;
  type: GroupType;
  type_sequence: number;
  // class
  class_name: string;
  acc_group_id: number | null;
  // subclass
  subclass_name: string;
  acc_class_id: number | null;
  sub_side: Side;
  cf_category: CfCat;
  prefix: string;
  // title
  acc_name: string;
  acc_subclass_id: number | null;
  title_side: Side;
  subsidiary: Subsidiary[];
}

function emptyForm(): FormState {
  return {
    level: 'group', editingId: null,
    group_name: '', type: 'REAL', type_sequence: 1,
    class_name: '', acc_group_id: null,
    subclass_name: '', acc_class_id: null, sub_side: 'DEBIT', cf_category: 'NONE', prefix: 'NONE',
    acc_name: '', acc_subclass_id: null, title_side: 'DEBIT', subsidiary: [],
  };
}

@Component({
  selector: 'app-chart-of-accounts',
  imports: [FormsModule, Modal, Icon],
  template: `
    <!-- KPIs -->
    <div class="krow k4">
      <div class="kc kc-b">
        <span class="kc-ico">🧾</span>
        <div class="kc-lbl">Postable Accounts</div>
        <div class="kc-val">{{ kpis().titles }}</div>
        <div class="kc-sub">{{ kpis().activeTitles }} active · {{ kpis().inactiveTitles }} inactive</div>
      </div>
      <div class="kc kc-g">
        <span class="kc-ico">🏛️</span>
        <div class="kc-lbl">Real Accounts</div>
        <div class="kc-val">{{ kpis().byType.REAL }}</div>
        <div class="kc-sub">Balance-sheet titles</div>
      </div>
      <div class="kc kc-a">
        <span class="kc-ico">📈</span>
        <div class="kc-lbl">Nominal Accounts</div>
        <div class="kc-val">{{ kpis().byType.NOMINAL }}</div>
        <div class="kc-sub">Income-statement titles</div>
      </div>
      <div class="kc kc-v">
        <span class="kc-ico">💱</span>
        <div class="kc-lbl">Financial Accounts</div>
        <div class="kc-val">{{ kpis().byType.FINANCIAL }}</div>
        <div class="kc-sub">{{ kpis().groups }} groups · {{ kpis().classes }} classes · {{ kpis().subclasses }} subclasses</div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-h">
        <div class="card-t">Chart of Accounts</div>
        <div class="head-tools">
          <div class="search">
            <app-icon name="search" [size]="14" />
            <input class="search-in" type="search" placeholder="Search accounts, codes, prefixes…"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" name="coa-search" aria-label="Search chart of accounts" />
          </div>
          <label class="inactive-toggle">
            <input type="checkbox" [ngModel]="showInactive()" (ngModelChange)="showInactive.set($event)" name="coa-inactive" />
            Show inactive
          </label>
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="toggleAll()">
            {{ allExpanded() ? 'Collapse all' : 'Expand all' }}
          </button>
          @if (canCreate()) {
            <button class="ph-btn ph-btn-primary ph-btn-sm" type="button" (click)="openCreate('group')">＋ Group</button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="skel-wrap">
          @for (s of [1,2,3,4,5,6]; track s) { <div class="skel"></div> }
        </div>
      } @else if (error()) {
        <div class="ph-alert ph-alert-error">
          {{ error() }}
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="load()" style="margin-left:10px">Retry</button>
        </div>
      } @else if (tree().length === 0) {
        <div class="empty">
          <div class="ico">📚</div>
          <div class="title">No account groups yet</div>
          @if (canCreate()) {
            <div class="hint">Start the hierarchy by adding a <strong>＋ Group</strong> (Real / Nominal / Financial).</div>
          } @else {
            <div class="hint">No accounts have been set up. Ask an administrator to configure the chart of accounts.</div>
          }
        </div>
      } @else if (visibleTree().length === 0) {
        <div class="empty">
          <div class="ico">🔍</div>
          <div class="title">No accounts match “{{ query() }}”</div>
          <div class="hint">Try a different name, code, or prefix — or <button class="linkbtn" type="button" (click)="query.set('')">clear the search</button>.</div>
        </div>
      } @else {
        <div class="tree" role="tree" aria-label="Chart of accounts">
          @for (g of visibleTree(); track g.id) {
            <!-- ── Group ── -->
            <div class="node n-group" [class.dim]="!g.is_active" role="treeitem" [attr.aria-expanded]="isOpen('g', g.id)">
              <button class="twist" type="button" (click)="toggle('g', g.id)"
                      [attr.aria-label]="(isOpen('g', g.id) ? 'Collapse ' : 'Expand ') + g.group_name">
                <app-icon [name]="isOpen('g', g.id) ? 'chevron-down' : 'chevron-right'" [size]="15" />
              </button>
              <span class="lvl-tag t-group">GROUP</span>
              <span class="badge" [class]="typeBadge(g.type)">{{ g.type }}</span>
              <span class="nm" [class.struck]="!g.is_active">{{ g.group_name }}</span>
              <span class="cnt">{{ g.classes.length }} {{ g.classes.length === 1 ? 'class' : 'classes' }}</span>
              <span class="spacer"></span>
              @if (!g.is_active) { <span class="pill p-off">Inactive</span> }
              <span class="acts">
                @if (canCreate()) {
                  <button class="iact" type="button" title="Add class" (click)="openCreate('class', { groupId: g.id })">＋ Class</button>
                }
                @if (canEdit()) {
                  <button class="iact" type="button" title="Edit group" (click)="openEdit('group', g)">Edit</button>
                }
                @if (canDelete()) {
                  <button class="iact" [class.danger]="g.is_active" type="button"
                          (click)="toggleActive('group', g)">{{ g.is_active ? 'Deactivate' : 'Reactivate' }}</button>
                }
              </span>
            </div>

            @if (isOpen('g', g.id)) {
              @if (g.classes.length === 0) {
                <div class="leaf-empty" style="--ind:1">No classes. @if (canCreate()) { <button class="linkbtn" type="button" (click)="openCreate('class', { groupId: g.id })">Add the first class</button>. }</div>
              }
              @for (c of g.classes; track c.id) {
                <!-- ── Class ── -->
                <div class="node n-class" style="--ind:1" [class.dim]="!c.is_active" role="treeitem" [attr.aria-expanded]="isOpen('c', c.id)">
                  <button class="twist" type="button" (click)="toggle('c', c.id)"
                          [attr.aria-label]="(isOpen('c', c.id) ? 'Collapse ' : 'Expand ') + c.class_name">
                    <app-icon [name]="isOpen('c', c.id) ? 'chevron-down' : 'chevron-right'" [size]="15" />
                  </button>
                  <span class="lvl-tag t-class">CLASS</span>
                  <span class="nm" [class.struck]="!c.is_active">{{ c.class_name }}</span>
                  <span class="cnt">{{ c.subclasses.length }} {{ c.subclasses.length === 1 ? 'subclass' : 'subclasses' }}</span>
                  <span class="spacer"></span>
                  @if (!c.is_active) { <span class="pill p-off">Inactive</span> }
                  <span class="acts">
                    @if (canCreate()) {
                      <button class="iact" type="button" title="Add subclass" (click)="openCreate('subclass', { groupId: g.id, classId: c.id })">＋ Subclass</button>
                    }
                    @if (canEdit()) {
                      <button class="iact" type="button" (click)="openEdit('class', c, { groupId: g.id })">Edit</button>
                    }
                    @if (canDelete()) {
                      <button class="iact" [class.danger]="c.is_active" type="button"
                              (click)="toggleActive('class', c)">{{ c.is_active ? 'Deactivate' : 'Reactivate' }}</button>
                    }
                  </span>
                </div>

                @if (isOpen('c', c.id)) {
                  @if (c.subclasses.length === 0) {
                    <div class="leaf-empty" style="--ind:2">No subclasses. @if (canCreate()) { <button class="linkbtn" type="button" (click)="openCreate('subclass', { groupId: g.id, classId: c.id })">Add the first subclass</button>. }</div>
                  }
                  @for (sc of c.subclasses; track sc.id) {
                    <!-- ── Subclass ── -->
                    <div class="node n-sub" style="--ind:2" [class.dim]="!sc.is_active" role="treeitem" [attr.aria-expanded]="isOpen('s', sc.id)">
                      <button class="twist" type="button" (click)="toggle('s', sc.id)"
                              [attr.aria-label]="(isOpen('s', sc.id) ? 'Collapse ' : 'Expand ') + sc.subclass_name">
                        <app-icon [name]="isOpen('s', sc.id) ? 'chevron-down' : 'chevron-right'" [size]="15" />
                      </button>
                      <span class="lvl-tag t-sub">SUBCLASS</span>
                      <span class="nm" [class.struck]="!sc.is_active">{{ sc.subclass_name }}</span>
                      <span class="side-pill" [class.s-debit]="sc.side==='DEBIT'" [class.s-credit]="sc.side==='CREDIT'">{{ sc.side }}</span>
                      @if (sc.prefix && sc.prefix !== 'NONE') { <span class="prefix mono" title="Account code prefix">#{{ sc.prefix }}</span> }
                      @if (sc.cf_category !== 'NONE') { <span class="cf">{{ cfLabel(sc.cf_category) }}</span> }
                      <span class="cnt">{{ sc.titles.length }} {{ sc.titles.length === 1 ? 'title' : 'titles' }}</span>
                      <span class="spacer"></span>
                      @if (!sc.is_active) { <span class="pill p-off">Inactive</span> }
                      <span class="acts">
                        @if (canCreate()) {
                          <button class="iact" type="button" title="Add title" (click)="openCreate('title', { groupId: g.id, classId: c.id, subclassId: sc.id, subSide: sc.side })">＋ Title</button>
                        }
                        @if (canEdit()) {
                          <button class="iact" type="button" (click)="openEdit('subclass', sc, { groupId: g.id, classId: c.id })">Edit</button>
                        }
                        @if (canDelete()) {
                          <button class="iact" [class.danger]="sc.is_active" type="button"
                                  (click)="toggleActive('subclass', sc)">{{ sc.is_active ? 'Deactivate' : 'Reactivate' }}</button>
                        }
                      </span>
                    </div>

                    @if (isOpen('s', sc.id)) {
                      @if (sc.titles.length === 0) {
                        <div class="leaf-empty" style="--ind:3">No postable titles. @if (canCreate()) { <button class="linkbtn" type="button" (click)="openCreate('title', { groupId: g.id, classId: c.id, subclassId: sc.id, subSide: sc.side })">Add the first title</button>. }</div>
                      }
                      @for (t of sc.titles; track t.id) {
                        <!-- ── Title (postable leaf) ── -->
                        <div class="node n-title" style="--ind:3" [class.dim]="!t.is_active" role="treeitem">
                          <span class="twist-spacer"></span>
                          <span class="code mono" title="Account code (within subclass)">{{ codeLabel(sc.prefix, t.acc_code) }}</span>
                          <span class="nm leaf" [class.struck]="!t.is_active">{{ t.acc_name }}</span>
                          <span class="side-pill" [class.s-debit]="t.side==='DEBIT'" [class.s-credit]="t.side==='CREDIT'">{{ t.side }}</span>
                          @if (t.side !== sc.side) {
                            <span class="contra" title="Contra account — normal side differs from its subclass">⇄ contra</span>
                          }
                          @for (sub of (t.subsidiary || []); track sub) {
                            <span class="chip">{{ subLabel(sub) }}</span>
                          }
                          <span class="spacer"></span>
                          @if (!t.is_active) { <span class="pill p-off">Inactive</span> }
                          <span class="acts">
                            @if (canEdit()) {
                              <button class="iact" type="button" (click)="openEdit('title', t, { groupId: g.id, classId: c.id, subclassId: sc.id, subSide: sc.side })">Edit</button>
                            }
                            @if (canDelete()) {
                              <button class="iact" [class.danger]="t.is_active" type="button"
                                      (click)="toggleActive('title', t)">{{ t.is_active ? 'Deactivate' : 'Reactivate' }}</button>
                            }
                          </span>
                        </div>
                      }
                    }
                  }
                }
              }
            }
          }
        </div>

        <div class="legend">
          <span class="side-pill s-debit">DEBIT</span> / <span class="side-pill s-credit">CREDIT</span> = normal balance ·
          <span class="contra">⇄ contra</span> = title side differs from subclass ·
          <span class="chip">Subsidiary</span> = sub-ledger linkage · dimmed/struck = inactive
        </div>
      }
    </div>

    <!-- ── Add / Edit modal ── -->
    <app-modal [open]="showForm()" [title]="modalTitle()" (closed)="closeForm()">
      <form (ngSubmit)="save()">
        @switch (form.level) {
          @case ('group') {
            <div class="form-grid">
              <div class="ph-field col-2">
                <label class="ph-label">Group name *</label>
                <input class="ph-input" [(ngModel)]="form.group_name" name="group_name" required placeholder="e.g. Real Accounts" />
              </div>
              <div class="ph-field">
                <label class="ph-label">Type *</label>
                <select class="ph-select" [(ngModel)]="form.type" name="type" (ngModelChange)="onTypeChange($event)" required>
                  <option value="REAL">REAL — Balance sheet</option>
                  <option value="NOMINAL">NOMINAL — Income statement</option>
                  <option value="FINANCIAL">FINANCIAL — Cash flow</option>
                </select>
              </div>
              <div class="ph-field">
                <label class="ph-label">Type sequence</label>
                <input class="ph-input mono" type="number" min="1" max="3" [(ngModel)]="form.type_sequence" name="type_sequence" />
                <span class="fhint">1 Real · 2 Nominal · 3 Financial</span>
              </div>
            </div>
          }
          @case ('class') {
            <div class="form-grid">
              <div class="ph-field col-2">
                <label class="ph-label">Class name *</label>
                <input class="ph-input" [(ngModel)]="form.class_name" name="class_name" required placeholder="e.g. Current Assets" />
              </div>
              <div class="ph-field">
                <label class="ph-label">Parent group *</label>
                <select class="ph-select" [(ngModel)]="form.acc_group_id" name="acc_group_id" required>
                  @for (g of tree(); track g.id) { <option [ngValue]="g.id">{{ g.group_name }} ({{ g.type }})</option> }
                </select>
              </div>
            </div>
          }
          @case ('subclass') {
            <div class="form-grid">
              <div class="ph-field col-2">
                <label class="ph-label">Subclass name *</label>
                <input class="ph-input" [(ngModel)]="form.subclass_name" name="subclass_name" required placeholder="e.g. Cash and Cash Equivalents" />
              </div>
              <div class="ph-field">
                <label class="ph-label">Parent class *</label>
                <select class="ph-select" [(ngModel)]="form.acc_class_id" name="acc_class_id" required>
                  @for (opt of classOptions(); track opt.id) { <option [ngValue]="opt.id">{{ opt.label }}</option> }
                </select>
              </div>
              <div class="ph-field">
                <label class="ph-label">Normal side *</label>
                <select class="ph-select" [(ngModel)]="form.sub_side" name="sub_side" required>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              <div class="ph-field">
                <label class="ph-label">Cash-flow category</label>
                <select class="ph-select" [(ngModel)]="form.cf_category" name="cf_category">
                  @for (cf of cfCats; track cf) { <option [value]="cf">{{ cfLabel(cf) }}</option> }
                </select>
              </div>
              <div class="ph-field">
                <label class="ph-label">Code prefix</label>
                <input class="ph-input mono" [(ngModel)]="form.prefix" name="prefix" placeholder="NONE / 10 / 11…" />
                <span class="fhint">Display prefix for child codes</span>
              </div>
            </div>
          }
          @case ('title') {
            <div class="form-grid">
              <div class="ph-field col-2">
                <label class="ph-label">Account title *</label>
                <input class="ph-input" [(ngModel)]="form.acc_name" name="acc_name" required placeholder="e.g. Cash in Bank" />
              </div>
              <div class="ph-field">
                <label class="ph-label">Parent subclass *</label>
                <select class="ph-select" [(ngModel)]="form.acc_subclass_id" name="acc_subclass_id"
                        (ngModelChange)="onSubclassChange($event)" [disabled]="form.editingId !== null" required>
                  @for (opt of subclassOptions(); track opt.id) { <option [ngValue]="opt.id">{{ opt.label }}</option> }
                </select>
                @if (form.editingId !== null) { <span class="fhint">Re-parenting isn’t supported — create a new title under the target subclass instead.</span> }
              </div>
              <div class="ph-field">
                <label class="ph-label">Normal side *</label>
                <select class="ph-select" [(ngModel)]="form.title_side" name="title_side" required>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
                @if (isContra()) { <span class="fhint contra">⇄ Contra — differs from subclass ({{ form.sub_side }})</span> }
              </div>
              <div class="ph-field col-2">
                <label class="ph-label">Subsidiary sub-ledgers</label>
                <div class="chip-row">
                  @for (s of subsidiaries; track s) {
                    <button type="button" class="chip-toggle" [class.on]="form.subsidiary.includes(s)" (click)="toggleSubsidiary(s)">
                      {{ subLabel(s) }}
                    </button>
                  }
                </div>
                <span class="fhint">Links postings to BANK / CUSTOMER / SUPPLIER / EMPLOYEE sub-ledgers</span>
              </div>
              @if (form.editingId === null && form.acc_subclass_id !== null) {
                <div class="ph-field col-2">
                  <div class="code-preview">Next code in this subclass: <b class="mono">{{ nextCodePreview() }}</b></div>
                </div>
              }
            </div>
          }
        }

        @if (formError()) { <div class="ph-alert ph-alert-error" style="margin-top:12px">{{ formError() }}</div> }

        <div class="form-actions">
          <button type="button" class="ph-btn ph-btn-ghost" (click)="closeForm()">Cancel</button>
          <button type="submit" class="ph-btn ph-btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : (form.editingId === null ? 'Create' : 'Save changes') }}
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
    .kc-v::after { background: linear-gradient(90deg, var(--violet), transparent); }
    .kc-ico { font-size: 22px; display: block; margin-bottom: 10px; }
    .kc-lbl { font-size: 10.5px; color: var(--sub); text-transform: uppercase; letter-spacing: .8px; font-weight: 600; margin-bottom: 6px; }
    .kc-val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--mono); letter-spacing: -1px; line-height: 1; margin-bottom: 6px; }
    .kc-sub { font-size: 11px; color: var(--sub); }
    .mb { margin-bottom: 20px; }

    /* Header tools */
    .head-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .search { position: relative; display: inline-flex; align-items: center; }
    .search app-icon { position: absolute; left: 9px; color: var(--dim); pointer-events: none; }
    .search-in {
      padding: 6px 10px 6px 28px; min-width: 240px;
      background: var(--raised); border: 1px solid var(--rim); border-radius: var(--r6);
      color: var(--text); font-size: 12px; font-family: var(--font);
    }
    .search-in:focus { outline: none; border-color: var(--mist); }
    .inactive-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--sub); cursor: pointer; user-select: none; }
    .inactive-toggle input { accent-color: var(--sky); }

    /* Tree */
    .tree { margin-top: 4px; }
    .node {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; padding-left: calc(10px + var(--ind, 0) * 26px);
      border-radius: var(--r6);
      border-left: 2px solid transparent;
      transition: background .12s;
    }
    .node:hover { background: var(--row-hover); }
    .node:hover .acts { opacity: 1; }
    .n-group { background: var(--raised); border-left-color: var(--gold); margin-top: 6px; }
    .n-class { border-left-color: var(--sky-rim); }
    .n-sub   { border-left-color: var(--jade-rim); }
    .n-title { }
    .node.dim { opacity: .5; }

    .twist { background: none; border: none; cursor: pointer; color: var(--sub); display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex-shrink: 0; border-radius: var(--r4); padding: 0; }
    .twist:hover { color: var(--text); background: var(--float); }
    .twist-spacer { width: 18px; flex-shrink: 0; }

    .lvl-tag { font-size: 8.5px; font-weight: 800; letter-spacing: .8px; padding: 1.5px 5px; border-radius: var(--r4); flex-shrink: 0; }
    .t-group { background: var(--gold-bg); color: var(--gold); }
    .t-class { background: var(--sky-bg); color: var(--sky); }
    .t-sub   { background: var(--jade-bg); color: var(--jade); }

    .nm { color: var(--text); font-weight: 600; font-size: 13px; }
    .n-class .nm { font-weight: 600; }
    .n-title .nm.leaf { font-weight: 500; font-size: 12.5px; }
    .nm.struck { text-decoration: line-through; text-decoration-color: var(--dim); }

    .code { font-size: 11px; color: var(--gold); background: var(--gold-bg); padding: 1px 6px; border-radius: var(--r4); flex-shrink: 0; min-width: 46px; text-align: center; }
    .badge { font-size: 9px; font-weight: 800; letter-spacing: .5px; padding: 2px 7px; border-radius: 10px; }
    .b-real     { background: var(--jade-bg); color: var(--jade); border: 1px solid var(--jade-rim); }
    .b-nominal  { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--gold-rim); }
    .b-financial{ background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-rim); }

    .side-pill { font-size: 9.5px; font-weight: 800; letter-spacing: .4px; padding: 1.5px 7px; border-radius: 10px; flex-shrink: 0; }
    .s-debit  { background: var(--sky-bg); color: var(--sky); }
    .s-credit { background: var(--violet-bg); color: var(--violet); }

    .prefix { font-size: 10.5px; color: var(--sub); }
    .cf { font-size: 9.5px; font-weight: 700; letter-spacing: .4px; color: var(--sub); background: var(--raised); padding: 1.5px 6px; border-radius: 10px; border: 1px solid var(--border); }
    .contra { font-size: 9.5px; font-weight: 700; color: var(--amber); background: var(--amber-bg); padding: 1.5px 7px; border-radius: 10px; white-space: nowrap; }
    .chip { font-size: 9.5px; font-weight: 700; color: var(--sub); background: var(--float); padding: 1.5px 7px; border-radius: 10px; white-space: nowrap; }

    .cnt { font-size: 10.5px; color: var(--dim); font-weight: 500; }
    .spacer { flex: 1; }
    .pill { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 9.5px; font-weight: 700; }
    .p-off { background: var(--rose-bg); color: var(--rose); }

    .acts { display: inline-flex; gap: 4px; opacity: 0; transition: opacity .12s; flex-shrink: 0; }
    .iact { background: var(--surface); border: 1px solid var(--rim); color: var(--sub); font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: var(--r6); cursor: pointer; white-space: nowrap; }
    .iact:hover { color: var(--text); border-color: var(--mist); }
    .iact.danger:hover { color: var(--rose); border-color: var(--rose-rim); background: var(--rose-bg); }

    .leaf-empty { padding: 6px 10px; padding-left: calc(10px + var(--ind, 0) * 26px + 26px); font-size: 11.5px; color: var(--dim); font-style: italic; }
    .linkbtn { background: none; border: none; color: var(--sky); cursor: pointer; font-size: inherit; padding: 0; text-decoration: underline; font-style: normal; }

    .legend { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--dim); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .legend .side-pill, .legend .contra, .legend .chip { display: inline-flex; }

    /* Skeleton */
    .skel-wrap { padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
    .skel { height: 34px; border-radius: var(--r6); background: linear-gradient(90deg, var(--raised) 0%, var(--float) 50%, var(--raised) 100%); background-size: 200% 100%; animation: shimmer 1.3s infinite; }
    .skel:nth-child(odd) { margin-left: 26px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .empty { text-align: center; padding: 36px 18px; color: var(--sub); }
    .empty .ico { font-size: 36px; margin-bottom: 8px; opacity: 0.6; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 600; }
    .empty .hint { font-size: 12px; color: var(--sub); }

    /* Form */
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .form-grid .col-2 { grid-column: span 2; }
    .fhint { font-size: 10.5px; color: var(--dim); margin-top: 2px; }
    .fhint.contra { color: var(--amber); font-weight: 700; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }

    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-toggle { background: var(--raised); border: 1px solid var(--rim); color: var(--sub); font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 20px; cursor: pointer; }
    .chip-toggle:hover { border-color: var(--mist); color: var(--text); }
    .chip-toggle.on { background: var(--sky-bg); border-color: var(--sky-rim); color: var(--sky); }
    .code-preview { font-size: 11.5px; color: var(--sub); background: var(--raised); border: 1px dashed var(--rim); border-radius: var(--r6); padding: 8px 12px; }
    .code-preview b { color: var(--text); }

    @media (max-width: 720px) {
      .form-grid { grid-template-columns: 1fr; }
      .form-grid .col-2 { grid-column: span 1; }
      .acts { opacity: 1; }
    }
  `,
})
export class ChartOfAccounts {
  auth = inject(AuthService);

  readonly subsidiaries = SUBSIDIARIES;
  readonly cfCats = CF_CATS;

  tree = signal<Group[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  query = signal('');
  showInactive = signal(false);

  openG = signal<Set<number>>(new Set());
  openC = signal<Set<number>>(new Set());
  openS = signal<Set<number>>(new Set());

  showForm = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form: FormState = emptyForm();

  canCreate = () => this.auth.canDo(PAGE, 'create');
  canEdit = () => this.auth.canDo(PAGE, 'edit');
  canDelete = () => this.auth.canDo(PAGE, 'delete');

  kpis = computed(() => {
    const groups = this.tree();
    let classes = 0, subclasses = 0, titles = 0, activeTitles = 0, inactiveTitles = 0;
    const byType: Record<GroupType, number> = { REAL: 0, NOMINAL: 0, FINANCIAL: 0 };
    for (const g of groups) {
      classes += g.classes.length;
      for (const c of g.classes) {
        subclasses += c.subclasses.length;
        for (const sc of c.subclasses) {
          for (const t of sc.titles) {
            titles++;
            byType[g.type]++;
            if (t.is_active) activeTitles++; else inactiveTitles++;
          }
        }
      }
    }
    return { groups: groups.length, classes, subclasses, titles, activeTitles, inactiveTitles, byType };
  });

  // Filtered tree: applies inactive toggle + search, keeping ancestor paths of any match.
  visibleTree = computed<Group[]>(() => {
    const q = this.query().trim().toLowerCase();
    const showInactive = this.showInactive();
    const keepInactive = (active: boolean) => active || showInactive;
    const matches = (s: string) => !q || s.toLowerCase().includes(q);

    const out: Group[] = [];
    for (const g of this.tree()) {
      if (!keepInactive(g.is_active)) continue;
      const gHit = matches(g.group_name) || matches(g.type);
      const classes: Klass[] = [];
      for (const c of g.classes) {
        if (!keepInactive(c.is_active)) continue;
        const cHit = matches(c.class_name);
        const subs: Subclass[] = [];
        for (const sc of c.subclasses) {
          if (!keepInactive(sc.is_active)) continue;
          const scHit = matches(sc.subclass_name) || matches(sc.prefix) || matches(sc.side);
          const titles = sc.titles.filter(t =>
            keepInactive(t.is_active) &&
            (gHit || cHit || scHit || matches(t.acc_name) ||
             matches(String(t.acc_code)) || matches(this.codeLabel(sc.prefix, t.acc_code)) ||
             (t.subsidiary || []).some(s => matches(s))));
          // If an ancestor or the subclass itself matched, show all its (inactive-filtered)
          // titles; otherwise show only the titles that matched the query.
          const branchHit = gHit || cHit || scHit;
          const keepSub = !q || branchHit || titles.length > 0;
          if (keepSub) {
            subs.push({ ...sc, titles: branchHit ? sc.titles.filter(t => keepInactive(t.is_active)) : titles });
          }
        }
        const keepClass = !q || gHit || cHit || subs.length > 0;
        if (keepClass) classes.push({ ...c, subclasses: subs });
      }
      const keepGroup = !q || gHit || classes.length > 0;
      if (keepGroup) out.push({ ...g, classes });
    }
    return out;
  });

  allIds = computed(() => {
    const gs = new Set<number>(), cs = new Set<number>(), ss = new Set<number>();
    for (const g of this.tree()) {
      gs.add(g.id);
      for (const c of g.classes) { cs.add(c.id); for (const sc of c.subclasses) ss.add(sc.id); }
    }
    return { gs, cs, ss };
  });

  allExpanded = computed(() => {
    const { gs } = this.allIds();
    return gs.size > 0 && this.openG().size >= gs.size;
  });

  constructor() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await supabase
      .from('acc_groups')
      .select(`
        id, group_name, type, type_sequence, is_active,
        classes:acc_classes ( id, class_name, sequence_no, is_active,
          subclasses:acc_subclasses ( id, subclass_name, side, cf_category, prefix, sequence_no, is_active,
            titles:acc_titles ( id, acc_name, acc_code, side, subsidiary, is_active ) ) )
      `)
      .order('type_sequence', { ascending: true });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    const groups = (data ?? []) as unknown as Group[];
    for (const g of groups) {
      g.classes = (g.classes ?? []).sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0));
      for (const c of g.classes) {
        c.subclasses = (c.subclasses ?? []).sort((a: any, b: any) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0));
        for (const sc of c.subclasses) {
          sc.titles = (sc.titles ?? []).sort((a, b) => a.acc_code - b.acc_code);
        }
      }
    }
    this.tree.set(groups);
    // Default: expand groups so the shape is visible on first paint.
    if (this.openG().size === 0 && this.openC().size === 0) {
      this.openG.set(new Set(groups.map(g => g.id)));
    }
  }

  // ── Expand / collapse ──
  isOpen(kind: 'g' | 'c' | 's', id: number): boolean {
    if (this.query().trim()) return true; // search auto-expands matched paths
    const set = kind === 'g' ? this.openG() : kind === 'c' ? this.openC() : this.openS();
    return set.has(id);
  }
  toggle(kind: 'g' | 'c' | 's', id: number) {
    const sig = kind === 'g' ? this.openG : kind === 'c' ? this.openC : this.openS;
    const next = new Set(sig());
    if (next.has(id)) next.delete(id); else next.add(id);
    sig.set(next);
  }
  toggleAll() {
    if (this.allExpanded()) {
      this.openG.set(new Set()); this.openC.set(new Set()); this.openS.set(new Set());
    } else {
      const { gs, cs, ss } = this.allIds();
      this.openG.set(new Set(gs)); this.openC.set(new Set(cs)); this.openS.set(new Set(ss));
    }
  }

  // ── Form lifecycle ──
  // Method, not computed(): reads `this.form`, a plain object reassigned in
  // openCreate/openEdit (NOT a signal). A computed() would freeze at its
  // construction value, so the modal title wouldn't reflect the level/edit mode
  // of the form just opened. A method re-evaluates every CD pass.
  modalTitle() {
    const verb = this.form.editingId === null ? 'Add' : 'Edit';
    const noun = this.form.level === 'group' ? 'Group'
      : this.form.level === 'class' ? 'Class'
      : this.form.level === 'subclass' ? 'Subclass' : 'Account Title';
    return `${verb} ${noun}`;
  }

  classOptions = computed(() =>
    this.tree().flatMap(g => g.classes.map(c => ({ id: c.id, label: `${c.class_name} — ${g.group_name}` }))));
  subclassOptions = computed(() =>
    this.tree().flatMap(g => g.classes.flatMap(c => c.subclasses.map(sc =>
      ({ id: sc.id, label: `${sc.subclass_name} — ${c.class_name}` })))));

  openCreate(level: Level, ctx?: { groupId?: number; classId?: number; subclassId?: number; subSide?: Side }) {
    const f = emptyForm();
    f.level = level;
    if (ctx?.groupId != null) f.acc_group_id = ctx.groupId;
    if (ctx?.classId != null) f.acc_class_id = ctx.classId;
    if (ctx?.subclassId != null) { f.acc_subclass_id = ctx.subclassId; if (ctx.subSide) { f.sub_side = ctx.subSide; f.title_side = ctx.subSide; } }
    this.form = f;
    this.formError.set(null);
    this.showForm.set(true);
  }

  openEdit(level: Level, node: any, ctx?: { groupId?: number; classId?: number; subclassId?: number; subSide?: Side }) {
    const f = emptyForm();
    f.level = level;
    f.editingId = node.id;
    if (level === 'group') { f.group_name = node.group_name; f.type = node.type; f.type_sequence = node.type_sequence; }
    else if (level === 'class') { f.class_name = node.class_name; f.acc_group_id = ctx?.groupId ?? null; }
    else if (level === 'subclass') {
      f.subclass_name = node.subclass_name; f.acc_class_id = ctx?.classId ?? null;
      f.sub_side = node.side; f.cf_category = node.cf_category; f.prefix = node.prefix ?? 'NONE';
    } else {
      f.acc_name = node.acc_name; f.acc_subclass_id = ctx?.subclassId ?? null;
      f.title_side = node.side; f.subsidiary = [...(node.subsidiary ?? [])];
      f.sub_side = ctx?.subSide ?? node.side;
    }
    this.form = f;
    this.formError.set(null);
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); }

  onTypeChange(type: GroupType) {
    this.form.type_sequence = type === 'REAL' ? 1 : type === 'NOMINAL' ? 2 : 3;
  }
  onSubclassChange(id: number) {
    const sc = this.findSubclass(id);
    if (sc) { this.form.sub_side = sc.side; if (this.form.editingId === null) this.form.title_side = sc.side; }
  }
  toggleSubsidiary(s: Subsidiary) {
    const arr = this.form.subsidiary;
    this.form.subsidiary = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
  }
  isContra = () => this.form.level === 'title' && this.form.title_side !== this.form.sub_side;

  nextCodePreview(): number {
    const sc = this.form.acc_subclass_id != null ? this.findSubclass(this.form.acc_subclass_id) : null;
    if (!sc) return 1;
    return sc.titles.reduce((m, t) => Math.max(m, t.acc_code), 0) + 1;
  }

  private findSubclass(id: number): Subclass | null {
    for (const g of this.tree()) for (const c of g.classes) for (const sc of c.subclasses) if (sc.id === id) return sc;
    return null;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    try {
      const f = this.form;
      const actorId = this.auth.user()?.id ?? null;
      if (f.level === 'group') await this.saveGroup(f);
      else if (f.level === 'class') await this.saveClass(f);
      else if (f.level === 'subclass') await this.saveSubclass(f);
      else await this.saveTitle(f, actorId);
      this.saving.set(false);
      this.closeForm();
      await this.load();
    } catch (e: any) {
      this.saving.set(false);
      this.formError.set(e?.message ?? 'Could not save. Please try again.');
    }
  }

  private stamp() {
    return { modified_at: new Date().toISOString(), modified_by: this.auth.user()?.id ?? null };
  }

  private async saveGroup(f: FormState) {
    const body = { group_name: f.group_name.trim(), type: f.type, type_sequence: Number(f.type_sequence) || 1 };
    if (f.editingId === null) {
      const seq = this.tree().reduce((m, g) => Math.max(m, g.type_sequence ?? 0), 0) + 1;
      const { data, error } = await supabase.from('acc_groups').insert({ ...body, sequence_no: seq }).select('id').single();
      if (error) throw error;
      await this.history('COA_GROUP', data?.id ?? null, body.group_name, 'CREATED', body);
    } else {
      const { error } = await supabase.from('acc_groups').update({ ...body, ...this.stamp() }).eq('id', f.editingId);
      if (error) throw error;
      await this.history('COA_GROUP', f.editingId, body.group_name, 'UPDATED', body);
    }
  }

  private async saveClass(f: FormState) {
    if (f.acc_group_id == null) throw new Error('Select a parent group.');
    const body = { class_name: f.class_name.trim(), acc_group_id: f.acc_group_id };
    if (f.editingId === null) {
      const parent = this.tree().find(g => g.id === f.acc_group_id);
      const seq = (parent?.classes ?? []).reduce((m, c) => Math.max(m, c.sequence_no ?? 0), 0) + 1;
      const { data, error } = await supabase.from('acc_classes').insert({ ...body, sequence_no: seq }).select('id').single();
      if (error) throw error;
      await this.history('COA_CLASS', data?.id ?? null, body.class_name, 'CREATED', body);
    } else {
      const { error } = await supabase.from('acc_classes').update({ ...body, ...this.stamp() }).eq('id', f.editingId);
      if (error) throw error;
      await this.history('COA_CLASS', f.editingId, body.class_name, 'UPDATED', body);
    }
  }

  private async saveSubclass(f: FormState) {
    if (f.acc_class_id == null) throw new Error('Select a parent class.');
    const body = {
      subclass_name: f.subclass_name.trim(), acc_class_id: f.acc_class_id,
      side: f.sub_side, cf_category: f.cf_category, prefix: (f.prefix || 'NONE').trim() || 'NONE',
    };
    if (f.editingId === null) {
      let siblings: Subclass[] = [];
      for (const g of this.tree()) for (const c of g.classes) if (c.id === f.acc_class_id) siblings = c.subclasses;
      const seq = siblings.reduce((m, s) => Math.max(m, s.sequence_no ?? 0), 0) + 1;
      const { data, error } = await supabase.from('acc_subclasses').insert({ ...body, sequence_no: seq }).select('id').single();
      if (error) throw error;
      await this.history('COA_SUBCLASS', data?.id ?? null, body.subclass_name, 'CREATED', body);
    } else {
      const { error } = await supabase.from('acc_subclasses').update({ ...body, ...this.stamp() }).eq('id', f.editingId);
      if (error) throw error;
      await this.history('COA_SUBCLASS', f.editingId, body.subclass_name, 'UPDATED', body);
    }
  }

  private async saveTitle(f: FormState, _actorId: string | null) {
    if (f.acc_subclass_id == null) throw new Error('Select a parent subclass.');
    const sc = this.findSubclass(f.acc_subclass_id);
    if (!sc) throw new Error('Parent subclass not found — reload and try again.');
    // Resolve denormalized class + group ids from the tree.
    let classId: number | null = null, groupId: number | null = null;
    for (const g of this.tree()) for (const c of g.classes) {
      if (c.subclasses.some(x => x.id === sc.id)) { classId = c.id; groupId = g.id; }
    }
    if (classId == null || groupId == null) throw new Error('Could not resolve class/group for this subclass.');

    const subsidiary = f.subsidiary.length ? f.subsidiary : [];

    if (f.editingId === null) {
      // acc_code = max+1 across ALL titles (active+inactive) in this subclass — unique constraint ignores is_active.
      const { data: existing, error: readErr } = await supabase
        .from('acc_titles').select('acc_code').eq('acc_subclass_id', sc.id)
        .order('acc_code', { ascending: false }).limit(1);
      if (readErr) throw readErr;
      const nextCode = ((existing?.[0]?.acc_code as number | undefined) ?? 0) + 1;
      const body = {
        acc_name: f.acc_name.trim(), acc_subclass_id: sc.id, acc_class_id: classId, acc_group_id: groupId,
        acc_code: nextCode, side: f.title_side, subsidiary,
      };
      const { data, error } = await supabase.from('acc_titles').insert(body).select('id').single();
      if (error) throw error;
      await this.history('COA_TITLE', data?.id ?? null, body.acc_name, 'CREATED', body);
    } else {
      const body = { acc_name: f.acc_name.trim(), side: f.title_side, subsidiary, ...this.stamp() };
      const { error } = await supabase.from('acc_titles').update(body).eq('id', f.editingId);
      if (error) throw error;
      await this.history('COA_TITLE', f.editingId, f.acc_name.trim(), 'UPDATED', body);
    }
  }

  async toggleActive(level: Level, node: any) {
    const table = level === 'group' ? 'acc_groups' : level === 'class' ? 'acc_classes' : level === 'subclass' ? 'acc_subclasses' : 'acc_titles';
    const refType = level === 'group' ? 'COA_GROUP' : level === 'class' ? 'COA_CLASS' : level === 'subclass' ? 'COA_SUBCLASS' : 'COA_TITLE';
    const name = node.group_name ?? node.class_name ?? node.subclass_name ?? node.acc_name ?? '';
    const next = !node.is_active;
    // Optimistic flip so the UI feels instant; reload reconciles.
    const prev = this.tree();
    node.is_active = next;
    this.tree.set([...prev]);
    const { error } = await supabase.from(table).update({ is_active: next, ...this.stamp() }).eq('id', node.id);
    if (error) {
      node.is_active = !next;
      this.tree.set([...prev]);
      this.error.set(`Could not ${next ? 'reactivate' : 'deactivate'} “${name}”: ${error.message}`);
      return;
    }
    await this.history(refType as any, node.id, name, next ? 'ACTIVATED' : 'DEACTIVATED', { is_active: next });
    await this.load();
  }

  // Best-effort audit log — never blocks or rolls back the user's mutation.
  private async history(refType: string, refId: number | null, refName: string, action: string, payload: any) {
    try {
      await supabase.from('acc_coa_history').insert({
        ref_type: refType, ref_id: refId, ref_name: refName, action,
        actor_id: this.auth.user()?.id ?? null,
        actor_name: this.auth.user()?.user_metadata?.['full_name'] ?? this.auth.user()?.email ?? null,
        payload,
      });
    } catch { /* audit is best-effort */ }
  }

  // ── Labels ──
  typeBadge(t: GroupType) { return t === 'REAL' ? 'b-real' : t === 'NOMINAL' ? 'b-nominal' : 'b-financial'; }
  cfLabel(c: CfCat) { return c === 'NONE' ? 'No CF' : c.charAt(0) + c.slice(1).toLowerCase(); }
  subLabel(s: Subsidiary) { return s.charAt(0) + s.slice(1).toLowerCase(); }
  codeLabel(prefix: string, code: number) {
    const p = prefix && prefix !== 'NONE' ? prefix : '';
    return p ? `${p}-${String(code).padStart(2, '0')}` : String(code).padStart(3, '0');
  }
}
