import { afterNextRender, Component, computed, Injector, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Icon } from '../ui/icon';

/**
 * Help Center — built-in, offline guided help for the whole JKL rice-mill ERP.
 *
 * NO live AI: every word is static, transcribed verbatim from two authored
 * sources — docs/system-help-content.md (Jinho: orientation, module map, the
 * end-to-end flow cards, doc-numbering, System Flow Q&A) and
 * docs/accounting-assistant-content.md (Beru: COA setup, glossary, accounting
 * Q&A, journal-entry cheat cards) — into the consts below.
 *
 * The page is the "assistant": one global search filters across EVERY content
 * set at once (flow cards, module map, all Q&A, glossary, cheat cards). Browse
 * mode is organised into two tabs — System Flow & Structure (default) and
 * Accounting — so the headline use case ("what's the flow of the system?")
 * lands first. Search overlays both tabs regardless of which is active.
 *
 * Strings use backticks throughout so authored apostrophes ("you're", "don't")
 * and double-quoted account names need no escaping. Account titles keep the
 * en-dash `–` exactly — these are the seeded Chart of Accounts names.
 */

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM FLOW & STRUCTURE — Jinho's source
// ════════════════════════════════════════════════════════════════════════════

// ── Orientation (PART 1) ────────────────────────────────────────────────────
const SYS_INTRO: { title: string; body: string }[] = [
  {
    title: `It's the operations system for your rice mill`,
    body: `JKL ERP is the one place the whole business is recorded and tracked: buying paddy and supplies, milling paddy into rice, weighing trucks at the weighbridge, selling and delivering rice, running your vending machines ("vendos"), and keeping the books. Instead of notebooks, loose receipts, and separate spreadsheets, every job is entered once as a document — a purchase order, a goods receipt, a sales order, a milling batch, a weighbridge ticket — and the system keeps each document, its number, and its status in order.`,
  },
  {
    title: `Work is grouped into "workspaces"`,
    body: `A workspace is a whole business unit. Right now the live one is the Milling workspace — the rice/grain operation this guide describes. (A second "Hardware" workspace exists as a placeholder for the future.) When you log in you pick a workspace, and everything you do happens inside it.`,
  },
  {
    title: `Inside a workspace, work is organised into modules`,
    body: `Modules are the items in the left sidebar, grouped (Overview, Operations, Sales, Procurement, and so on). Each entry opens one module where you do one kind of work. The module map below walks the sidebar; the flow cards show how documents pass from one module to the next. You don't need to understand accounting to use the system — the books are handled behind the scenes (see the Accounting tab for that side).`,
  },
];

// ── Module map (PART 2) ─────────────────────────────────────────────────────
type ModuleStatus = 'LIVE' | 'COMING SOON' | 'LIVE (partial)';
interface ModuleItem { name: string; status: ModuleStatus; what: string; }
interface ModuleGroup { group: string; items: ModuleItem[]; }

const MODULE_MAP: ModuleGroup[] = [
  {
    group: `Overview`,
    items: [
      { name: `Dashboard`, status: `LIVE`, what: `Your home screen: the key numbers at a glance (revenue this month, stock alerts, what needs attention).` },
    ],
  },
  {
    group: `Operations`,
    items: [
      { name: `Weighbridge`, status: `LIVE`, what: `Weigh a truck in and out, capture the net weight, price the ticket, and mark it cash or credit.` },
      { name: `Milling`, status: `LIVE`, what: `Run production: turn paddy into rice (plus bran and husk), and log toll-milling jobs done for customers.` },
      { name: `Inventory`, status: `LIVE (partial)`, what: `Your stock master per SKU (on-hand, reserved, value) plus a manual stock-adjustment log. Receipts and deliveries do not move stock counts automatically yet — only the manual Adjust action changes on-hand today.` },
      { name: `Quality Inspection`, status: `LIVE`, what: `Record the quality check on received material (moisture, impurity, grade) and a pass/reject result.` },
    ],
  },
  {
    group: `Sales`,
    items: [
      { name: `Customers`, status: `LIVE`, what: `Your customer list, with credit limit and balance used by the sales credit check.` },
      { name: `Sales Orders`, status: `LIVE`, what: `Take a customer order for rice/goods. Confirming runs a credit-hold check.` },
      { name: `Delivery`, status: `LIVE`, what: `Schedule and track the truck dispatch for an order (driver, plate, destination, status).` },
      { name: `Sales Invoices`, status: `LIVE`, what: `Issue the customer invoice for an order. Posts Dr Accounts Receivable / Cr Sales (rice is VAT-exempt; VATable goods also Cr Output VAT) and lifts the customer's AR balance.` },
      { name: `Collections`, status: `LIVE`, what: `Record the customer's payment / official receipt against an invoice. Posts Dr Cash + Dr CWT Receivable (for any tax they withheld) / Cr AR, and lowers the AR balance.` },
      { name: `Accounts Receivable`, status: `LIVE`, what: `Track what customers owe you: invoice a confirmed/delivered order to post AR, then record collections against it. The balance is maintained automatically and feeds the sales credit check.` },
      { name: `DCPR`, status: `LIVE`, what: `Daily Collection & Payment Report — money in and money out per cash account, per day, built from your posted ledger.` },
    ],
  },
  {
    group: `Procurement`,
    items: [
      { name: `Suppliers`, status: `LIVE`, what: `Your supplier list (and whether they're BIR-registered, which affects withholding).` },
      { name: `Purchase Requests`, status: `LIVE`, what: `Raise an internal request to buy something — the start of the buying flow.` },
      { name: `Canvasses`, status: `LIVE (partial)`, what: `Open a canvass to compare supplier prices. Today this is a header-only screen; entering individual quotes and picking a winner per item is a planned follow-up, so POs are issued directly for now.` },
      { name: `Purchase Orders`, status: `LIVE`, what: `Issue the formal order to a supplier at agreed prices; route it for approval.` },
      { name: `Goods Receipt`, status: `LIVE`, what: `Record goods physically arriving against a PO (received vs ordered quantity, with a QC result).` },
      { name: `Supplier Invoices`, status: `LIVE`, what: `Record and manage supplier bills (vendor invoices / APVs) against goods receipts. Posts Dr GR/IR → Cr Accounts Payable, holding back Withholding Tax Payable (EWT). This is where you book what you owe a supplier.` },
      { name: `Items`, status: `LIVE`, what: `The master list of things you buy (the item catalog used on PRs and POs).` },
      { name: `Warehouses`, status: `LIVE`, what: `Your storage locations, used when receiving and holding stock.` },
    ],
  },
  {
    group: `Importation`,
    items: [
      { name: `Shipments`, status: `COMING SOON`, what: `Will track imported shipments and customs clearance. Placeholder for now.` },
    ],
  },
  {
    group: `Accounting`,
    items: [
      { name: `Chart of Accounts`, status: `LIVE`, what: `Your master list of money "buckets," pre-built for a Philippine rice mill. (See the Accounting tab for setup help.)` },
      { name: `General Ledger`, status: `LIVE`, what: `The actual books — the journal entries that operations create flow in here.` },
      { name: `Accounts Payable`, status: `LIVE`, what: `Track what you owe suppliers: record a supplier bill against a receipt, then pay it. Both post to the General Ledger automatically.` },
      { name: `BIR Compliance`, status: `LIVE`, what: `Prepared VAT, sales/purchase books, and withholding schedules pulled from your posted ledger — for filing with your accountant (it doesn't e-file or print BIR forms).` },
    ],
  },
  {
    group: `Treasury`,
    items: [
      { name: `Check Voucher`, status: `LIVE`, what: `Pay one OR many supplier bills (APVs) in a single check: posts one Dr Accounts Payable line per bill + one Cr Cash from the chosen cash account. Supports full or partial payment and void. EWT is not re-applied here — it was already withheld when the bill was recorded.` },
      { name: `Cash Position`, status: `LIVE`, what: `Daily cash position (DCP) / liquidity view: per cash account Opening → Inflows → Outflows → Closing plus a consolidated total, a closing-balance trend, and an indicative forward projection (bills due as outflows vs receivables due as inflows).` },
    ],
  },
  {
    group: `HR & Reports`,
    items: [
      { name: `Employees`, status: `COMING SOON`, what: `Staff records. Placeholder for now.` },
      { name: `Payroll`, status: `COMING SOON`, what: `Pay runs. Placeholder for now.` },
      { name: `Reports`, status: `COMING SOON`, what: `Cross-module reports. Placeholder for now.` },
      { name: `Vendos`, status: `LIVE`, what: `Your vending machines and their cash in/out movements.` },
    ],
  },
  {
    group: `Help`,
    items: [
      { name: `Help Center`, status: `LIVE`, what: `Built-in, plain-English help for the whole system — the module map, the flows, and the accounting answers (this page).` },
    ],
  },
];

// ── Flow cards (PART 3) ──────────────────────────────────────────────────────
interface FlowStep { name: string; doc?: string; what: string; creates?: string; books?: string; comingSoon?: boolean; }
interface FlowCard {
  id: string;
  title: string;
  tag: string;
  diagram: string[];
  steps: FlowStep[];
}

const FLOWS: FlowCard[] = [
  {
    id: 'procure-to-pay',
    title: `Procure-to-Pay`,
    tag: `Buying`,
    diagram: [`Purchase Request`, `Canvass`, `Purchase Order`, `Goods Receipt`, `Quality Inspection`, `Supplier Invoice`, `Check Voucher`],
    steps: [
      { name: `Purchase Request (PR)`, doc: `PR-`, what: `Someone needs to buy something; you raise a request listing the items and quantities.`, creates: `A PR document. It's the basis for shopping around (the Canvass) and, ultimately, the order.` },
      { name: `Canvass`, doc: `CNV-`, what: `Compare supplier prices for the requested items. (Today header-only; detailed quote entry and picking a winner per item are a planned follow-up, so in practice you often go straight to the PO.)`, creates: `A canvass document. Tells you which supplier and price to put on the Purchase Order.` },
      { name: `Purchase Order (PO)`, doc: `PO-`, what: `Issue the formal order to the chosen supplier at agreed prices, then route it for approval. A PO moves pending approval → approved, and later → received once goods arrive. For non-BIR-registered suppliers it also works out the withholding-tax (EWT) figure for reference.`, creates: `A PO document. When goods arrive, you receive them against this approved PO, and its prices value the receipt.` },
      { name: `Goods Receipt (GRN)`, doc: `GRN-`, what: `When goods physically arrive, pick the open PO and record what actually came in (received vs ordered quantity, plus a quality result). This flips the PO to received.`, books: `Yes — posts to the General Ledger automatically. Records the value of the stock received and the amount you owe the supplier (parked in a "goods received, not yet invoiced" bucket until the supplier's bill arrives). Note: this records the accounting value but does not yet bump your Inventory on-hand count — that's still manual today.` },
      { name: `Quality Inspection (QC)`, doc: `QC-`, what: `Record the lab/visual check on the received material — moisture, impurity, grade — and a pass / partial-reject / reject verdict.`, books: `Nothing posts; this is a quality workflow step (a rejection may justify a dispute on the receipt).` },
      { name: `Supplier Invoice / Bill`, doc: `SB-`, what: `Record the supplier's bill against the receipt. This clears the "goods received, not yet invoiced" bucket into a real payable, holding back any expanded withholding tax (EWT) you must remit.`, books: `Yes — posts to the General Ledger automatically. Dr Goods Received Not Invoiced (GR/IR) / Cr Accounts Payable – Trade, with any EWT held back to Withholding Tax Payable.` },
      { name: `Check Voucher (CV)`, doc: `CV-`, what: `Pay supplier bills. A single Check Voucher can settle one OR many of a supplier's open bills (APVs) in one check — pick the supplier, tick the bill(s), apply a full or partial amount to each, choose the cash/bank account, and post. The check total is the sum of what you applied; a CV can also be voided. EWT is not re-applied here — it was already withheld when each bill was recorded. This is how a recorded bill (APV) gets settled.`, books: `Yes — posts to the General Ledger automatically. One Dr Accounts Payable – Trade line per bill + one Cr Cash for the full check, from the chosen cash account. The procure-to-pay chain now flows fully into the books.` },
    ],
  },
  {
    id: 'order-to-cash',
    title: `Order-to-Cash`,
    tag: `Selling`,
    diagram: [`Sales Order`, `Delivery`, `Sales Invoice`, `Collection`],
    steps: [
      { name: `Sales Order (SO)`, doc: `SO-`, what: `Take a customer's order for rice/goods. Save it as a draft, or Confirm it. On confirm, the system runs a credit-hold check: if the customer is over their credit limit / flagged, the order is held on credit hold instead of confirmed.`, creates: `An SO document. A confirmed order is what you dispatch against.` },
      { name: `Delivery (DO)`, doc: `DO-`, what: `Schedule the truck for a confirmed order — driver, plate, destination — and advance it scheduled → in transit → delivered.`, books: `Nothing posts yet, and stock is not reduced automatically — the delivery record is a logistics record today.` },
      { name: `Sales Invoice (SI)`, doc: `SI-`, what: `Bill the customer for the order — the document that records the sale, the receivable, and any VAT. It now has its own dedicated page under Sales → Sales Invoices. Raising it lifts the customer's AR balance automatically.`, books: `Yes — posts to the General Ledger automatically. Dr Accounts Receivable – Trade / Cr Sales (rice is VAT-exempt; VATable goods also Cr Output VAT). The cost of the rice sold (COGS) is still deferred — an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory.` },
      { name: `Collection (OR)`, doc: `OR-`, what: `Record the customer's payment against their invoice. It now has its own dedicated page under Sales → Collections. Lowers the customer's AR balance automatically.`, books: `Yes — posts to the General Ledger automatically. Dr Cash (plus Creditable Withholding Tax Receivable for any tax the customer withheld) / Cr Accounts Receivable – Trade.` },
    ],
  },
  {
    id: 'milling',
    title: `Milling`,
    tag: `Your own production`,
    diagram: [`Paddy in`, `Milling Batch`, `Rice + Bran + Husk out`],
    steps: [
      { name: `Milling Batch`, doc: `MB-`, what: `Start a production run: how much paddy goes in, then record the rice, bran, and husk that come out, the recovery %, and the cost. Advance the batch planned → in progress → completed.`, books: `Yes — when you mark the batch completed, it posts automatically. It records paddy moving out of raw materials, through "work-in-process," and into finished rice plus byproducts at cost — no sale, no VAT, because it's a transformation, not a sale. (Stock counts in the Inventory module are not auto-updated yet.)` },
    ],
  },
  {
    id: 'toll-milling',
    title: `Toll Milling`,
    tag: `Milling service for a customer`,
    diagram: [`Customer's paddy`, `Toll Milling job`, `Service revenue`],
    steps: [
      { name: `Toll Milling job`, doc: `TM-`, what: `A customer brings their own paddy to be milled for a per-sack fee. Log the job: sacks in, outputs, recovery %, the fee, and who keeps the byproducts.`, books: `Yes — posts automatically. Because the grain is the customer's, none of it is your inventory; you simply earn a service fee (cash in, toll-milling revenue — VAT-exempt for palay-to-rice).` },
    ],
  },
  {
    id: 'weighbridge',
    title: `Weighbridge`,
    tag: `Truck weighing`,
    diagram: [`Weigh vehicle (gross/tare → net)`, `Priced ticket (cash or credit)`, `Revenue + VAT`],
    steps: [
      { name: `Weighbridge ticket`, doc: `WT-`, what: `Weigh the vehicle, capture the net weight, set the price, and mark it cash or credit.`, books: `Yes — a priced ticket posts automatically. Weighing is a taxable service, so the ticket records the weighing revenue plus 12% output VAT, with the money going to cash (or to "what the customer owes" for a credit ticket). An unpriced/pending ticket doesn't post.` },
    ],
  },
  {
    id: 'vendo',
    title: `Vendo`,
    tag: `Vending machines`,
    diagram: [`Vendo machine`, `Log a cash movement (income or expense)`],
    steps: [
      { name: `Vendo cash movement`, what: `For each machine, log money in (a coin-drop/sale) or money out (a refill or repair cost).`, books: `Yes — posts automatically. An income entry records cash in and vendo sales; an expense entry records the cost and cash out.` },
    ],
  },
  {
    id: 'inventory',
    title: `Inventory`,
    tag: `Stock master + adjustments`,
    diagram: [`SKU master`, `manual Adjust`, `stock movement log`],
    steps: [
      { name: `Inventory`, what: `Keep a master record per SKU (on-hand, reserved, available, value, reorder point), and change stock with the manual Adjust action.`, creates: `An updated on-hand figure plus a movement log entry.`, books: `Known limitation: receiving goods (GRN) and making deliveries do NOT move stock counts automatically yet. Today only the manual Adjust action changes on-hand. Wiring receipts/deliveries/milling to move stock automatically is a known upcoming item — treat on-hand as something you keep accurate by adjusting, not something the buy/sell flow updates for you.` },
    ],
  },
];

const FLOW_SUMMARY = `Nearly all of your operational documents now flow into the General Ledger automatically through a behind-the-scenes posting engine: buying (Goods Receipt, Supplier Bill, Check Voucher), selling (Sales Invoice, Collection), completed Milling Batches, Toll Milling, priced Weighbridge tickets, and Vendo cash movements each create a balanced accounting entry the moment you record them. The one honest exception is the cost of rice sold (COGS) — a Sales Invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory, so that's matched separately once costing is switched on. You don't have to do anything to make posting happen; it's automatic. The entries themselves are permanent (they can be reversed but not silently edited). The resulting liquidity — cash on hand and in bank, opening → in → out → closing per account and a forward projection — shows up in Treasury → Cash Position (DCP). For what each entry means in accounting terms, see the Accounting tab.`;

// ── Flow GRAPH model (PART 3, diagram view) ──────────────────────────────────
// An explicit node graph layered over the FLOWS data above. Topology lives here
// (the cards' `diagram: string[]` and 1-step-but-3-node flows can't express
// fan-outs or ghost nodes). Each node carries its own visual encoding, and
// `stepRef` indexes back into the matching FlowCard.steps so the detail panel
// REUSES the authored step text — no duplication. Nodes with no own step (raw
// materials, byproducts, the stock log) carry an inline `blurb` instead.
//
// `kind`:  'doc'      a numbered document (badge = code) — the spine of a flow
//          'material' a physical thing (paddy, rice, bran) — not a document
//          'gl'       the General Ledger terminal a posting flow converges into
// `postsGL` marks the node whose action writes the books (jade treatment + GL badge).
// `comingSoon` ghosts a not-yet-built node (dashed + muted pill).
interface FlowNode {
  id: string;
  label: string;
  code?: string;
  kind: 'doc' | 'material' | 'gl';
  postsGL?: boolean;
  comingSoon?: boolean;
  stepRef?: number;   // index into FlowCard.steps
  blurb?: string;     // detail text for nodes with no own step
}
// A flow's graph is one or more node rows. A single row is a left-to-right chain;
// `branch` rows render the milling-style fan-out (one source → many outputs).
interface FlowGraph {
  flowId: string;
  rows: FlowNode[];          // the main chain (rendered as a flex node-chain)
  branchFrom?: string;       // id of the node the branch fans out from
  branch?: FlowNode[];       // fan-out outputs (rendered in the SVG branch panel)
}

const FLOW_GRAPHS: FlowGraph[] = [
  {
    flowId: 'procure-to-pay',
    rows: [
      { id: 'pr', label: `Purchase Request`, code: `PR-`, kind: 'doc', stepRef: 0 },
      { id: 'cnv', label: `Canvass`, code: `CNV-`, kind: 'doc', stepRef: 1 },
      { id: 'po', label: `Purchase Order`, code: `PO-`, kind: 'doc', stepRef: 2 },
      { id: 'grn', label: `Goods Receipt`, code: `GRN-`, kind: 'doc', postsGL: true, stepRef: 3 },
      { id: 'qc', label: `Quality Inspection`, code: `QC-`, kind: 'doc', stepRef: 4 },
      { id: 'inv', label: `Supplier Invoice`, code: `SB-`, kind: 'doc', postsGL: true, stepRef: 5 },
      { id: 'pay', label: `Check Voucher`, code: `CV-`, kind: 'doc', postsGL: true, stepRef: 6 },
    ],
  },
  {
    flowId: 'order-to-cash',
    rows: [
      { id: 'so', label: `Sales Order`, code: `SO-`, kind: 'doc', stepRef: 0 },
      { id: 'do', label: `Delivery`, code: `DO-`, kind: 'doc', stepRef: 1 },
      { id: 'si', label: `Sales Invoice`, code: `SI-`, kind: 'doc', postsGL: true, stepRef: 2 },
      { id: 'col', label: `Collection`, code: `OR-`, kind: 'doc', postsGL: true, stepRef: 3 },
    ],
  },
  {
    flowId: 'milling',
    rows: [
      { id: 'paddy', label: `Paddy`, kind: 'material', stepRef: 0, blurb: `Your own paddy (raw material) goes into the batch. It's consumed from raw-materials inventory when the batch completes.` },
      { id: 'mb', label: `Milling Batch`, code: `MB-`, kind: 'doc', postsGL: true, stepRef: 0 },
    ],
    branchFrom: 'mb',
    branch: [
      { id: 'rice', label: `Rice`, kind: 'material', stepRef: 0, blurb: `Finished rice out — the main product, costed into finished-goods inventory.` },
      { id: 'bran', label: `Bran`, kind: 'material', stepRef: 0, blurb: `Bran byproduct out — recorded into byproduct inventory at cost.` },
      { id: 'husk', label: `Husk`, kind: 'material', stepRef: 0, blurb: `Husk byproduct out — recorded into byproduct inventory at cost.` },
    ],
  },
  {
    flowId: 'toll-milling',
    rows: [
      { id: 'cpaddy', label: `Customer's Paddy`, kind: 'material', stepRef: 0, blurb: `The grain is the customer's, not yours — it never enters your inventory.` },
      { id: 'tm', label: `Toll Milling Job`, code: `TM-`, kind: 'doc', postsGL: true, stepRef: 0 },
      { id: 'rev', label: `Service Revenue`, kind: 'material', stepRef: 0, blurb: `You earn a per-sack service fee (VAT-exempt for palay-to-rice) — cash in, toll-milling revenue.` },
    ],
  },
  {
    flowId: 'weighbridge',
    rows: [
      { id: 'weigh', label: `Weigh Vehicle`, kind: 'material', stepRef: 0, blurb: `Capture gross/tare → net weight for the vehicle.` },
      { id: 'wt', label: `Priced Ticket`, code: `WT-`, kind: 'doc', postsGL: true, stepRef: 0 },
      { id: 'wcash', label: `Cash or Credit`, kind: 'material', stepRef: 0, blurb: `A priced ticket posts weighing revenue + 12% output VAT — to cash, or to "what the customer owes" for a credit ticket.` },
    ],
  },
  {
    flowId: 'vendo',
    rows: [
      { id: 'machine', label: `Vendo Machine`, kind: 'material', stepRef: 0, blurb: `Each vending machine you operate.` },
      { id: 'mv', label: `Cash Movement`, kind: 'doc', postsGL: true, stepRef: 0 },
      { id: 'inout', label: `Income or Expense`, kind: 'material', stepRef: 0, blurb: `Income records cash in + vendo sales; expense records a refill/repair cost + cash out.` },
    ],
  },
  {
    flowId: 'inventory',
    rows: [
      { id: 'sku', label: `SKU Master`, kind: 'material', stepRef: 0, blurb: `The per-SKU master record: on-hand, reserved, available, value, reorder point.` },
      { id: 'adjust', label: `Manual Adjust`, kind: 'doc', stepRef: 0 },
      { id: 'log', label: `Stock Log`, kind: 'material', stepRef: 0, blurb: `A movement-log entry plus the updated on-hand figure. Note: receipts/deliveries do NOT move stock automatically yet — only this manual Adjust does.` },
    ],
  },
];

// The GL-convergence "money shot": the posting flows that reach the books, with
// the document node that does the posting. Drives the dedicated convergence SVG.
const GL_SOURCES: { label: string; code: string }[] = [
  { label: `Goods Receipt`, code: `GRN-` },
  { label: `Supplier Bill`, code: `SB-` },
  { label: `Check Voucher`, code: `CV-` },
  { label: `Sales Invoice`, code: `SI-` },
  { label: `Collection`, code: `OR-` },
  { label: `Milling (completed)`, code: `MB-` },
  { label: `Toll Milling`, code: `TM-` },
  { label: `Weighbridge (priced)`, code: `WT-` },
  { label: `Vendo movement`, code: `` },
];

// ── Document numbering (PART 4) ──────────────────────────────────────────────
const DOC_CODES: { code: string; doc: string }[] = [
  { code: `PR-`, doc: `Purchase Request` },
  { code: `CNV-`, doc: `Canvass` },
  { code: `PO-`, doc: `Purchase Order` },
  { code: `GRN-`, doc: `Goods Receipt` },
  { code: `QC-`, doc: `Quality Inspection` },
  { code: `SB-`, doc: `Supplier Invoice / Bill` },
  { code: `CV-`, doc: `Check Voucher (payment to supplier)` },
  { code: `SO-`, doc: `Sales Order` },
  { code: `DO-`, doc: `Delivery` },
  { code: `SI-`, doc: `Sales Invoice` },
  { code: `OR-`, doc: `Collection (Official Receipt)` },
  { code: `MB-`, doc: `Milling Batch` },
  { code: `TM-`, doc: `Toll Milling` },
  { code: `WT-`, doc: `Weighbridge Ticket` },
  { code: `GJ-`, doc: `General Journal entry (the accounting entry the system posts behind the scenes)` },
];

const STATUS_LIFECYCLES: { doc: string; flow: string[] }[] = [
  { doc: `Purchase Order`, flow: [`pending approval`, `approved`, `received`] },
  { doc: `Sales Order`, flow: [`draft`, `confirmed (or credit hold)`, `in transit`, `delivered`] },
  { doc: `Delivery`, flow: [`scheduled`, `in transit`, `delivered`] },
  { doc: `Milling Batch`, flow: [`planned`, `in progress`, `completed`] },
];

// ════════════════════════════════════════════════════════════════════════════
// ACCOUNTING — Beru's source (PART 1: COA setup walkthrough)
// ════════════════════════════════════════════════════════════════════════════
interface WalkStep { n: number; title: string; body: string; bullets?: string[]; }

const COA_WHAT = `A Chart of Accounts (COA) is just the master list of "buckets" your money can sit in or flow through — Cash, Sales, Inventory, Expenses, and so on. Every transaction in the system eventually drops amounts into one or more of these buckets. You do not need to be an accountant to use it. Most of the work is already done for you.`;

const COA_BEFORE: string[] = [
  `Your chart is already built for you (pre-seeded). We loaded a complete, Philippine rice-mill-ready chart: 3 Groups, 7 Classes, 12 Subclasses, and 44 ready-to-use Accounts. Your first job is reviewing and tidying, not building from zero.`,
  `It is a 4-level tree, biggest to smallest: Group → Class → Subclass → Account (Title). Click the arrow on any row to expand it and see what lives underneath. Think of it like folders (Groups/Classes) holding files (Accounts).`,
  `You almost never delete in accounting. If an account is wrong or unused, you deactivate it (hide it), never hard-delete it. This keeps your history honest.`,
];

const COA_LEVELS: { level: string; text: string }[] = [
  { level: 'Group', text: `The broadest bucket. There are only 3: REAL (things you keep — cash, what you own, what you owe), NOMINAL (things that reset each year — sales and expenses), and FINANCIAL (a presentation layer that rolls the others up into reports).` },
  { level: 'Class', text: `Sits inside a Group — e.g. Current Assets, Revenue, Operating Expenses.` },
  { level: 'Subclass', text: `Sits inside a Class — e.g. Cash and Cash Equivalents, Inventories, Tax Liabilities. The Subclass is where the Debit/Credit side, the cash-flow category, and the numbering prefix are set.` },
  { level: 'Account (Title)', text: `The actual bucket you post to — e.g. Cash on Hand, Sales – Rice (VAT-exempt), Accounts Payable – Trade. This is the only level a transaction touches.` },
];

const COA_STEPS: WalkStep[] = [
  { n: 1, title: `Open the Chart of Accounts page and expand a Group`, body: `Click the arrow beside Real Accounts to drill down through Class → Subclass → Account. Spend two minutes just looking — you will recognise most buckets (Cash, Sales, Utilities).` },
  { n: 2, title: `Review, don't rebuild`, body: `Because the chart is pre-seeded, read down the list and ask only: "Is anything we actually use missing?" and "Is anything here we will never use?" Most users change nothing.` },
  { n: 3, title: `Use search to jump to an account`, body: `Type a word (e.g. "rice", "VAT", "cash") in the search box. The tree expands straight to the matches so you don't have to hunt.` },
  {
    n: 4, title: `If you need a NEW account, add it at the right level`,
    body: `Use the ＋ Add button on the level you want. The form's fields change depending on the level:`,
    bullets: [
      `Add a Group (rare — you have all 3 already): enter Name, pick Type (REAL / NOMINAL / FINANCIAL), and a Type sequence (the order it shows in reports). You will almost never do this.`,
      `Add a Class: enter Name and pick its Parent Group. Example: a "Other Income" class under NOMINAL.`,
      `Add a Subclass: enter Name, pick Parent Class, choose the Side (DEBIT or CREDIT) — see Step 6 — pick a Cash-flow category (NONE / OPERATING / INVESTING / FINANCING; pick OPERATING if unsure, since day-to-day trading is operating), and set a Prefix (the leading digits of the account number).`,
      `Add a Title (the actual account) — this is the one you'll use most: enter Name, pick Parent Subclass, choose the Side (DEBIT or CREDIT), add Subsidiary tags only if this account is tracked per party (CUSTOMER for receivables, SUPPLIER for payables, BANK for a bank account, EMPLOYEE for staff advances; leave blank otherwise). The account code is generated for you — don't type it.`,
    ],
  },
  { n: 5, title: `Pick the Side correctly (this is the only "accounting" decision)`, body: `See Step 6 for what it means. Quick rule: things you own or spend are DEBIT; things you owe, your sales, or owner's money are CREDIT.` },
  {
    n: 6, title: `Understand DEBIT vs CREDIT "normal balance" in plain terms`,
    body: `Every account has a "home side" where its balance normally sits:`,
    bullets: [
      `DEBIT-normal = Assets (Cash, Inventory, Receivables) and Expenses. These go UP with a debit.`,
      `CREDIT-normal = Liabilities (Payables, taxes you owe), Equity (owner's money), and Income/Sales. These go UP with a credit.`,
      `That's it. "Debit" and "credit" are just left and right — not good or bad. A debit to Cash means more cash; a credit to Sales means more sales.`,
    ],
  },
  { n: 7, title: `To retire an account, DEACTIVATE it (never delete)`, body: `Use the Deactivate action on the node. It disappears from everyday dropdowns but stays in history. Flip the "Show inactive" toggle if you ever need to see or reactivate it.` },
  { n: 8, title: `To fix a name or setting, use Edit per node`, body: `Change a label or correct a side via the pencil/edit on that row. Avoid changing the side of an account that has already been used — add a new one instead and deactivate the old.` },
];

const COA_CHECKLIST: string[] = [
  `You've expanded all 3 Groups at least once and the structure makes sense.`,
  `Your main money buckets exist: Cash on Hand, Cash in Bank, Accounts Receivable – Trade, Accounts Payable – Trade, your Sales accounts, Inventory accounts, and your usual expenses. (All pre-seeded — just confirm.)`,
  `Anything you'll never use is deactivated, not deleted.`,
  `Any account you added has the right Side and the right Parent Subclass.`,
  `You did not invent account codes by hand (the system did that).`,
];

const COA_CLOSER = `Relax — if the chart is pre-seeded and you changed nothing, you are already done.`;

// ── Glossary (PART 2) ─────────────────────────────────────────────────────────
interface GlossaryItem { term: string; meaning: string; }

const GLOSSARY: GlossaryItem[] = [
  { term: `Chart of Accounts (COA)`, meaning: `The master list of every "bucket" money can sit in or pass through. The backbone of your books.` },
  { term: `Account / Title`, meaning: `One specific bucket you actually post to (e.g. Cash on Hand). The lowest level of the tree.` },
  { term: `Group`, meaning: `The top level — only 3 exist. REAL = permanent things you keep (carry over every year — the balance sheet). NOMINAL = temporary things (sales & expenses that reset to zero each year — the income statement). FINANCIAL = a presentation layer that rolls the others up into the formal reports.` },
  { term: `Class`, meaning: `A folder inside a Group (e.g. Current Assets, Revenue, Operating Expenses).` },
  { term: `Subclass`, meaning: `A smaller folder inside a Class (e.g. Inventories, Tax Liabilities). Holds the Side, cash-flow category, and number prefix.` },
  { term: `Debit`, meaning: `The left side of an entry. Increases assets and expenses; decreases liabilities, equity, income. Not "bad."` },
  { term: `Credit`, meaning: `The right side of an entry. Increases liabilities, equity, and income; decreases assets and expenses. Not "good."` },
  { term: `Normal balance`, meaning: `The side an account usually sits on. Assets/Expenses = Debit-normal. Liabilities/Equity/Income = Credit-normal.` },
  { term: `Contra account`, meaning: `An account that works backwards against its neighbour. E.g. Accumulated Depreciation (credit) reduces equipment; Allowance for Doubtful Accounts (credit) reduces receivables.` },
  { term: `Cash-flow category`, meaning: `A tag (OPERATING / INVESTING / FINANCING / NONE) telling the Cash Flow report which section a movement belongs to. Day-to-day trading = OPERATING.` },
  { term: `Subsidiary ledger`, meaning: `A breakdown of one account by party — e.g. Accounts Receivable split per customer. The tags CUSTOMER/SUPPLIER/BANK/EMPLOYEE turn this on.` },
  { term: `Assets`, meaning: `What the business owns or is owed (cash, inventory, receivables, equipment). Debit-normal.` },
  { term: `Liabilities`, meaning: `What the business owes (suppliers, taxes payable, loans). Credit-normal.` },
  { term: `Equity`, meaning: `The owner's stake — capital put in, plus profits kept, minus drawings. Credit-normal.` },
  { term: `Revenue / Income`, meaning: `Money earned from selling goods or services. Credit-normal.` },
  { term: `Expense`, meaning: `The cost of running the business (salaries, power, fuel). Debit-normal.` },
  { term: `COGS (Cost of Goods Sold)`, meaning: `The cost of the actual goods you sold — what the rice cost you, recorded when it's sold.` },
  { term: `WIP (Work-in-Process)`, meaning: `Goods mid-production — paddy that's being milled but isn't finished rice yet. An asset bucket.` },
  { term: `AR (Accounts Receivable)`, meaning: `Money customers owe you for sales made on credit. An asset.` },
  { term: `AP (Accounts Payable)`, meaning: `Money you owe suppliers for goods/services received. A liability.` },
  { term: `GR/IR (Goods Received Not Invoiced)`, meaning: `A temporary "we got the goods but the supplier bill hasn't arrived yet" holding account. Clears when the bill comes.` },
  { term: `Input VAT`, meaning: `The 12% VAT you pay on purchases. Normally claimable — but not for a rice mill (see VAT Q&A).` },
  { term: `Output VAT`, meaning: `The 12% VAT you charge customers on VATable sales. You owe this to the BIR.` },
  { term: `VAT-exempt`, meaning: `A sale with no VAT at all — not 0%, just outside VAT. Rice and palay-milling are VAT-exempt.` },
  { term: `EWT (Expanded Withholding Tax)`, meaning: `A small slice of a payment (1% on goods, 2% on services) the payer holds back and remits to the BIR on the payee's behalf.` },
  { term: `Form 2307`, meaning: `The BIR certificate proving EWT was withheld. The withholder gives it to the payee; the payee uses it as a tax credit.` },
  { term: `CWT (Creditable Withholding Tax) Receivable`, meaning: `When a customer withholds tax from paying you, that withheld amount is an asset — a prepaid income tax you can credit later.` },
  { term: `VAT-registered vs Non-VAT`, meaning: `Whether your business charges/claims 12% VAT (2550Q) or instead pays 3% percentage tax (2551Q). Affects which forms you file.` },
  { term: `1601-EQ`, meaning: `The quarterly BIR return for remitting EWT you withheld.` },
  { term: `2550Q`, meaning: `The quarterly VAT return.` },
  { term: `Posting / Journal entry`, meaning: `Turning a real-world event into balanced Debit/Credit lines in the books. The system now does this automatically across the board — buying (supplier bill, payment), selling (sales invoice, collection), milling, toll milling, weighbridge, and vendo. View every entry in Accounting → General Ledger. (One thing still deferred: the cost of rice sold (COGS) isn't booked at the point of sale yet — see the "Is this normal?" Q&A.)` },
];

// ════════════════════════════════════════════════════════════════════════════
// UNIFIED Q&A — System Flow + Accounting categories
// ════════════════════════════════════════════════════════════════════════════
type Category =
  | 'System Flow'
  | 'Getting Started'
  | 'Sales & Collections'
  | 'Purchases & Milling'
  | 'VAT'
  | 'Withholding Tax'
  | 'BIR / Compliance'
  | 'Is this normal?';

interface QA { category: Category; question: string; answer: string; related: string[]; }

const CATEGORIES: Category[] = [
  'System Flow',
  'Getting Started', 'Sales & Collections', 'Purchases & Milling',
  'VAT', 'Withholding Tax', 'BIR / Compliance', 'Is this normal?',
];

const QA: QA[] = [
  // ── System Flow (12) — Jinho's PART 5; headline question first ──
  { category: 'System Flow', question: `What's the flow of the system?`, answer: `JKL ERP follows two big flows plus a few standalone ones, all inside the Milling workspace. BUYING (Procure-to-Pay): you raise a Purchase Request, compare prices in a Canvass, issue a Purchase Order to a supplier, record a Goods Receipt when the goods arrive, run a Quality Inspection, then record the Supplier Bill and the Payment. SELLING (Order-to-Cash): you take a Sales Order (confirming runs a credit-hold check), schedule a Delivery, then raise a Sales Invoice and record the Collection. Alongside these: MILLING turns your paddy into rice, bran, and husk; TOLL MILLING is the same service done on a customer's own paddy for a fee; the WEIGHBRIDGE prices truck weighings; VENDOS log vending-machine cash; and INVENTORY holds your stock master. Each step creates a numbered document that feeds the next step. And nearly every operational document now posts to the General Ledger automatically — buying (Goods Receipt, Supplier Bill, Payment), selling (Sales Invoice, Collection), completed Milling, Toll Milling, priced Weighbridge tickets, and Vendo movements all reach the books. The one thing still deferred is the cost of rice sold (COGS) at the point of sale.`, related: [] },
  { category: 'System Flow', question: `How does buying work end to end?`, answer: `Purchase Request → Canvass → Purchase Order → Goods Receipt → Quality Inspection → Supplier Bill → Payment. You request what's needed, compare supplier prices (the Canvass is header-only for now, so POs are often issued directly), issue and approve the PO, then record the Goods Receipt when goods arrive — which flips the PO to "received" and posts the stock value and what you owe the supplier to the books automatically. A Quality Inspection records the quality check. Then you record the Supplier Bill (which clears the "goods received, not yet invoiced" bucket into a real payable, holding back any EWT) and the Payment (clearing the payable, cash out) — both post to the General Ledger automatically, so the buying chain now flows fully into the books.`, related: [] },
  { category: 'System Flow', question: `How does selling work?`, answer: `Sales Order → Delivery → Sales Invoice → Collection. You enter the customer's order; confirming it runs a credit-hold check (over-limit customers are held). Then you schedule and track the Delivery. You raise a Sales Invoice — which records the sale, lifts the customer's receivable (Dr AR / Cr Sales; rice is VAT-exempt, VATable goods also Cr Output VAT) — and record the Collection when they pay (Dr Cash, plus CWT Receivable for any tax they withheld / Cr AR). Both post to the General Ledger automatically. The one thing still deferred is the cost of the rice sold (COGS) at the point of sale.`, related: [] },
  { category: 'System Flow', question: `Where does milling fit?`, answer: `Milling is its own production flow, separate from buying and selling. You open a Milling Batch, record the paddy in and the rice/bran/husk out (with recovery % and cost), and advance it to completed. When it's completed, the system posts a "work-in-process to finished-goods" entry to the books automatically — paddy is consumed and finished rice plus byproducts are produced at cost. It's a transformation, not a sale, so there's no VAT.`, related: [] },
  { category: 'System Flow', question: `What's the difference between Milling and Toll Milling?`, answer: `In Milling you process YOUR OWN paddy into rice to sell later — the grain is your inventory. In Toll Milling a customer brings THEIR OWN paddy and pays you a per-sack fee to mill it — the grain never becomes your stock, so you only earn a service fee (VAT-exempt for palay-to-rice). Both are in the Milling module; toll jobs get a TM- receipt number and post the fee as service revenue automatically.`, related: [] },
  { category: 'System Flow', question: `What happens after I receive goods?`, answer: `Recording a Goods Receipt does three things: it creates a GRN- document, it flips the matching Purchase Order to "received", and it posts to the books automatically — recording the value of the stock received and the amount you owe the supplier (held in a "received but not yet invoiced" bucket). You can then run a Quality Inspection on the material. One thing it does NOT do yet: it doesn't bump your Inventory on-hand count automatically — that's still done with the manual Adjust action today.`, related: [] },
  { category: 'System Flow', question: `How does a sale become money in the books?`, answer: `Automatically, through two steps. The Sales Invoice turns a sale into revenue and a receivable (Dr Accounts Receivable / Cr Sales — rice is VAT-exempt; VATable goods also Cr Output VAT), and the Collection records the customer's payment (Dr Cash, plus CWT Receivable for any tax they withheld / Cr Accounts Receivable). Both post to the General Ledger the moment you save them, just like buying, milling, toll, weighbridge, and vendo. The only piece still deferred is the cost of the rice sold (COGS) — an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory.`, related: ['Accounts Receivable – Trade', 'Sales – Rice (VAT-exempt)', 'Output VAT Payable', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'System Flow', question: `Does receiving or delivering goods update my stock levels?`, answer: `Not yet. Right now your Inventory on-hand count only changes through the manual Adjust action in the Inventory module. Goods Receipts and Deliveries are recorded (and a receipt even posts its value to the books), but they don't move the on-hand quantity automatically. Wiring receipts, deliveries, and milling to move stock for you is a known upcoming improvement — for now, keep on-hand accurate by adjusting it.`, related: [] },
  { category: 'System Flow', question: `Which modules are live vs coming soon?`, answer: `LIVE: Dashboard; Weighbridge, Milling, Inventory, Quality Inspection; Customers, Sales Orders, Delivery, Sales Invoices, Collections, Accounts Receivable, DCPR; Suppliers, Purchase Requests, Canvasses, Purchase Orders, Goods Receipt, Supplier Invoices, Items, Warehouses; Chart of Accounts, General Ledger, Accounts Payable, BIR Compliance; Check Voucher and Cash Position (Treasury); Vendos; and this Help Center. COMING SOON (placeholders in the menu): Importation/Shipments; Employees, Payroll, Reports; and the formatted Balance Sheet / Income Statement report pages. Two live-but-partial spots: the Canvass screen is header-only (detailed quotes/winner picking deferred), and Inventory doesn't auto-receive from Goods Receipts yet.`, related: [] },
  { category: 'System Flow', question: `How do documents connect to each other?`, answer: `Each document is created from the one before it and feeds the one after. A Purchase Request leads to a Canvass and then a Purchase Order; the PO is what you receive against in a Goods Receipt; the receipt can be inspected in Quality Inspection. On the sales side, a Sales Order is what you dispatch against in a Delivery. Each document keeps a reference to its source (for example, a Goods Receipt knows which PO it's for), so you can trace any document back to where it started. Every document also carries its own auto number (PR-, PO-, GRN-, SO-, DO-, and so on).`, related: [] },
  { category: 'System Flow', question: `What is a workspace?`, answer: `A workspace is a whole business unit you work inside. The live one is the Milling workspace — the rice/grain operation this help describes. (A Hardware workspace exists as a future placeholder.) You pick a workspace after logging in, and the left-sidebar modules belong to that workspace.`, related: [] },
  { category: 'System Flow', question: `Do I have to do anything to post to the books?`, answer: `No. When posting is switched on (it is), the operational documents that have accounting meaning post themselves the moment you record them: Goods Receipt, Supplier Bill, Payment, Sales Invoice, Collection, a completed Milling Batch, Toll Milling, a priced Weighbridge ticket, and Vendo cash movements. You just do your normal work. The posted entries are permanent — they can be reversed but not quietly edited. For what each entry means, see the Accounting tab.`, related: [] },

  // ── Getting Started / COA (10) ──
  { category: 'Getting Started', question: `Do I need to make all the accounts from scratch?`, answer: `No. Your Chart of Accounts is pre-seeded with a full rice-mill setup — 3 Groups, 7 Classes, 12 Subclasses, and 44 ready accounts. Your job is to review it and tidy, not build it. Most people change nothing.`, related: [] },
  { category: 'Getting Started', question: `What is a debit and what is a credit, simply?`, answer: `They're just the left side (debit) and right side (credit) of an entry — not good or bad. Things you own or spend (Cash, Inventory, Expenses) go UP with a debit. Things you owe, your sales, and owner's money go UP with a credit. Every entry has equal debits and credits, so the books always balance.`, related: [] },
  { category: 'Getting Started', question: `I sell rice — which account do I use?`, answer: `Use "Sales – Rice (VAT-exempt)" for the rice income, and "Accounts Receivable – Trade" if the customer is buying on credit, or "Cash on Hand"/"Cash in Bank" if they pay now. Rice in its original state carries NO VAT.`, related: ['Sales – Rice (VAT-exempt)', 'Accounts Receivable – Trade', 'Cash on Hand', 'Cash in Bank'] },
  { category: 'Getting Started', question: `What does the FINANCIAL group mean? It's not money I touch.`, answer: `Correct — you never post to it. REAL and NOMINAL are where real transactions land. FINANCIAL is a presentation layer that rolls those up so your Balance Sheet, Income Statement, and Cash Flow reports come out formatted correctly. Leave it alone.`, related: [] },
  { category: 'Getting Started', question: `What's the difference between REAL and NOMINAL accounts?`, answer: `REAL accounts are permanent — cash, inventory, payables, owner's equity — they carry their balance into next year (the Balance Sheet). NOMINAL accounts — sales, cost of sales, expenses — are temporary; they reset to zero at year-end after their profit rolls into Retained Earnings (the Income Statement).`, related: ['Retained Earnings'] },
  { category: 'Getting Started', question: `How do I add a new expense account?`, answer: `Expand NOMINAL → Operating Expenses → its subclass, then click "＋ Add" at the Title level. Enter the name, pick the parent subclass, set Side = DEBIT (expenses are debit-normal), leave subsidiary tags blank, and let the code auto-generate.`, related: ['Miscellaneous Expense'] },
  { category: 'Getting Started', question: `I made an account by mistake — how do I delete it?`, answer: `You don't delete it — you deactivate it. Use the Deactivate action on that row. It hides from dropdowns but stays in history so your records remain trustworthy. Use the "Show inactive" toggle to find it again later.`, related: [] },
  { category: 'Getting Started', question: `What are the subsidiary tags (CUSTOMER, SUPPLIER, BANK, EMPLOYEE) for?`, answer: `They tell the system to track that account broken down by party. Tag Accounts Receivable with CUSTOMER so you can see who owes you; tag Accounts Payable with SUPPLIER to see who you owe; tag a bank account BANK; tag staff-advance accounts EMPLOYEE. Leave blank for accounts not tracked per party.`, related: ['Accounts Receivable – Trade', 'Accounts Payable – Trade', 'Cash in Bank', 'Advances to Employees'] },
  { category: 'Getting Started', question: `What is "normal balance"?`, answer: `It's the side an account usually sits on. Assets and Expenses are Debit-normal (they grow with debits). Liabilities, Equity, and Income are Credit-normal (they grow with credits). When you add an account, this is the "Side" you choose.`, related: [] },
  { category: 'Getting Started', question: `What is a contra account? I see "Accumulated Depreciation" under assets but it's a credit.`, answer: `A contra account works backwards against its neighbour. Accumulated Depreciation (credit) reduces the value of your equipment; Allowance for Doubtful Accounts (credit) reduces receivables you may not collect. They live next to what they offset, but carry the opposite side.`, related: ['Accumulated Depreciation', 'Allowance for Doubtful Accounts'] },

  // ── Sales & Collections (6) ──
  { category: 'Sales & Collections', question: `Where do I issue an invoice / record a payment?`, answer: `Both now have their own dedicated pages under Sales. Use Sales → Sales Invoices to issue the customer invoice (it posts Dr Accounts Receivable / Cr Sales and lifts the AR balance). Use Sales → Collections to record the customer's payment / official receipt against that invoice (it posts Dr Cash, plus CWT Receivable for any tax they withheld, / Cr Accounts Receivable and lowers the balance).`, related: ['Accounts Receivable – Trade', 'Sales – Rice (VAT-exempt)', 'Cash in Bank', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'Sales & Collections', question: `What's the difference between a Sales Invoice and an Official Receipt?`, answer: `Under the BIR's EOPT rules, the Sales Invoice is now the MAIN document — it's what records the sale and (for VATable items) the VAT. The Official Receipt is just a supplementary proof that you collected the cash afterward. For rice (VAT-exempt) the invoice simply shows no VAT.`, related: ['Sales – Rice (VAT-exempt)', 'Accounts Receivable – Trade'] },
  { category: 'Sales & Collections', question: `When is revenue actually recorded — when I deliver, or when I get paid?`, answer: `Revenue is recorded when you bill the sale (the invoice), not when cash arrives. Selling on credit: you record the sale and an Accounts Receivable now; the later payment just swaps that receivable for cash. Getting paid is not a second sale.`, related: ['Sales – Rice (VAT-exempt)', 'Accounts Receivable – Trade', 'Cash in Bank'] },
  { category: 'Sales & Collections', question: `A customer bought rice on credit — what hits which account?`, answer: `Debit "Accounts Receivable – Trade" (they owe you) and credit "Sales – Rice (VAT-exempt)" for the amount. No VAT on rice. The cost side (COGS) — what the rice cost you — will be matched separately when costing is switched on; for now an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory.`, related: ['Accounts Receivable – Trade', 'Sales – Rice (VAT-exempt)', 'Cost of Goods Sold', 'Inventory – Finished Goods (Rice)'] },
  { category: 'Sales & Collections', question: `The customer paid me. Where does the money go?`, answer: `Debit your cash account ("Cash on Hand" or "Cash in Bank", or "Undeposited Funds" if not yet banked) and credit "Accounts Receivable – Trade" to clear what they owed. If they withheld tax, see the withholding-tax Q&A.`, related: ['Cash in Bank', 'Undeposited Funds (Collections in Transit)', 'Accounts Receivable – Trade', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'Sales & Collections', question: `What is "Undeposited Funds"?`, answer: `A holding account for money you've collected but not yet brought to the bank. You debit it when you receive payment, then move it to "Cash in Bank" on the day you actually deposit. It keeps your book cash matching your bank.`, related: ['Undeposited Funds (Collections in Transit)', 'Cash in Bank'] },

  // ── Purchases & Milling (8) ──
  { category: 'Purchases & Milling', question: `I received goods from a supplier but no bill yet — what happens?`, answer: `You record the goods into inventory now and park the amount owed in "Goods Received Not Invoiced (GR/IR)", a temporary liability. Debit the relevant Inventory account, credit GR/IR. When the supplier's bill arrives, GR/IR clears into "Accounts Payable – Trade".`, related: ['Inventory – Paddy / Raw Materials', 'Goods Received Not Invoiced (GR/IR)', 'Accounts Payable – Trade'] },
  { category: 'Purchases & Milling', question: `What is GR/IR and why does it exist?`, answer: `GR/IR (Goods Received Not Invoiced) bridges the gap between getting the goods and getting the bill. It lets inventory go up immediately while holding the amount owed until the real invoice arrives — so nothing is missed and nothing is double-counted.`, related: ['Goods Received Not Invoiced (GR/IR)', 'Accounts Payable – Trade'] },
  { category: 'Purchases & Milling', question: `How do I record a supplier's bill?`, answer: `Go to Procurement → Supplier Invoices and use "Enter Bill" from a posted Goods Receipt. It books what you owe: Dr Goods Received Not Invoiced (GR/IR) → Cr Accounts Payable – Trade, with any expanded withholding tax (EWT) held back to Withholding Tax Payable. This is the step that turns "goods received" into a real payable you can later settle with a Check Voucher.`, related: ['Goods Received Not Invoiced (GR/IR)', 'Accounts Payable – Trade', 'Withholding Tax Payable (EWT)'] },
  { category: 'Purchases & Milling', question: `How do I record paying a supplier?`, answer: `Debit "Accounts Payable – Trade" (the debt goes down) and credit "Cash in Bank" (cash goes down). If you withheld EWT on the payment, credit "Withholding Tax Payable (EWT)" for that slice and pay the supplier the rest. In the app, to pay supplier bills you open Treasury → Check Voucher (see the "How do I pay a supplier?" answer).`, related: ['Accounts Payable – Trade', 'Cash in Bank', 'Withholding Tax Payable (EWT)'] },
  { category: 'Purchases & Milling', question: `What happens in the books when I mill paddy into rice?`, answer: `Milling is an internal transformation, not a sale — no VAT, no income. Paddy moves out of raw materials, through Work-in-Process, into finished rice (plus bran/husk byproducts). You also add the milling labor/power cost. See the cheat-sheet card "We milled paddy into rice."`, related: ['Inventory – Paddy / Raw Materials', 'Work-in-Process', 'Inventory – Finished Goods (Rice)', 'Inventory – Bran/Husk (Byproduct)', 'Milling Conversion Cost (Labor/Power/OH)'] },
  { category: 'Purchases & Milling', question: `What is Work-in-Process?`, answer: `It's a temporary inventory bucket for goods mid-production — paddy that's being milled but isn't finished rice yet. Paddy and milling costs flow IN; finished rice and byproducts flow OUT, leaving WIP empty when the batch is done.`, related: ['Work-in-Process', 'Inventory – Paddy / Raw Materials', 'Inventory – Finished Goods (Rice)'] },
  { category: 'Purchases & Milling', question: `What about the bran and husk — are they worth recording?`, answer: `Yes. Bran and husk are byproducts. When milling produces them, record them into "Inventory – Bran/Husk (Byproduct)" at their cost/fair value. If you later sell them, that's "Other Income / Byproduct Income". (Feed-grade bran/husk is generally VAT-exempt.)`, related: ['Inventory – Bran/Husk (Byproduct)', 'Other Income / Byproduct Income'] },
  { category: 'Purchases & Milling', question: `Someone brought their own paddy for me to mill (toll milling) — how's that different?`, answer: `The grain is theirs, not yours, so it never enters your inventory. You only earn a service fee: debit Cash or AR, credit "Toll Milling Service Revenue (VAT-exempt)". Palay-to-rice milling for others is VAT-exempt. If you keep the byproducts, also record them as byproduct inventory/income.`, related: ['Toll Milling Service Revenue (VAT-exempt)', 'Cash on Hand', 'Accounts Receivable – Trade', 'Inventory – Bran/Husk (Byproduct)', 'Other Income / Byproduct Income'] },

  // ── VAT (6) ──
  { category: 'VAT', question: `Why does my rice have NO VAT?`, answer: `Because the law (NIRC Section 109(1)(A)) lists rice in its original state — including husked and polished rice — and palay as VAT-EXEMPT. "Exempt" means no VAT at all, not 0%. So your rice sales account is literally named "Sales – Rice (VAT-exempt)" and you charge no Output VAT.`, related: ['Sales – Rice (VAT-exempt)'] },
  { category: 'VAT', question: `Why do weighing and the vendo machines HAVE 12% VAT but rice doesn't?`, answer: `Because weighing is a plain service with no agricultural exemption — it's VATable at 12% if you're VAT-registered. Vendo sales depend on the item: bottled water/snacks are VATable; an exempt agri-product would be exempt. So your "Weighing Service Revenue (VATable)" carries Output VAT, while rice does not. This mix makes you a "mixed-VAT" business.`, related: ['Weighing Service Revenue (VATable)', 'Vendo Sales', 'Output VAT Payable', 'Sales – Rice (VAT-exempt)'] },
  { category: 'VAT', question: `What does "non-creditable input VAT capitalized into cost" mean in plain words?`, answer: `Normally the 12% VAT you pay on purchases (Input VAT) is refundable against VAT you charge. But your main output — rice — is exempt, so you CAN'T claim back the VAT on rice-related purchases. Instead, you bury that VAT into the cost of the inventory itself. In short: for the rice side, VAT you pay is just part of what the goods cost you, not a refund you'll get.`, related: ['Inventory – Paddy / Raw Materials', 'Input VAT – Clearing (Transitional)'] },
  { category: 'VAT', question: `My business has both VAT-exempt rice and VATable weighing — is that a problem?`, answer: `Not a problem, just means you're "mixed-VAT." You charge 12% only on the VATable lines (weighing, VATable goods, some vendo items), nothing on rice/toll-milling. And the VAT you pay on purchases must be split: the part tied to VATable activity is claimable, the part tied to exempt rice is buried into cost. The system separates these via different revenue accounts.`, related: ['Sales – Rice (VAT-exempt)', 'Sales – VATable Goods', 'Weighing Service Revenue (VATable)', 'Output VAT Payable'] },
  { category: 'VAT', question: `Is toll milling (milling someone else's palay) VATable?`, answer: `No — "milling for others of palay into rice" is VAT-exempt under NIRC Section 109(1)(F). Do not add 12% to that fee. The exception: toll-processing that is NOT palay-to-rice (or corn-to-grits, cane-to-sugar) would be VATable — classify by what's being milled.`, related: ['Toll Milling Service Revenue (VAT-exempt)'] },
  { category: 'VAT', question: `What is Output VAT vs Input VAT?`, answer: `Output VAT is the 12% you charge customers on VATable sales — you owe it to the BIR. Input VAT is the 12% you pay suppliers on purchases — normally claimable back. You net them on the VAT return (2550Q). For your rice side, there's no Output VAT and the Input VAT isn't claimable.`, related: ['Output VAT Payable', 'Input VAT – Clearing (Transitional)'] },

  // ── Withholding Tax (5) ──
  { category: 'Withholding Tax', question: `What is EWT (Expanded Withholding Tax)?`, answer: `It's a small slice of a payment that the PAYER holds back and remits to the BIR for the payee. Standard rates are 1% on goods and 2% on services (RR 2-98). It's not an extra cost — it's a prepayment of the payee's income tax. The payer gives the payee a Form 2307 proving it.`, related: ['Withholding Tax Payable (EWT)', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'Withholding Tax', question: `When do I withhold from a supplier vs when does a customer withhold from me?`, answer: `When YOU pay a supplier and you're a withholding agent, you hold back 1%/2%, pay the supplier the rest, and the held amount sits in "Withholding Tax Payable (EWT)" until you remit it. When a CUSTOMER pays YOU and withholds, the held slice is your asset — "Creditable Withholding Tax (CWT) Receivable" — and you collect their Form 2307 to credit against your income tax.`, related: ['Withholding Tax Payable (EWT)', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'Withholding Tax', question: `What is Form 2307 and why do I need it?`, answer: `Form 2307 is the BIR certificate that proves tax was withheld. If a customer withholds from you, get their 2307 — it's your receipt to claim that amount as a tax credit (1701Q/1702Q). If you withhold from a supplier, you must issue them a 2307. No 2307, no credit.`, related: ['Creditable Withholding Tax (CWT) Receivable', 'Withholding Tax Payable (EWT)'] },
  { category: 'Withholding Tax', question: `I withheld tax from suppliers — how do I pay it to the BIR?`, answer: `The EWT you held sits in "Withholding Tax Payable (EWT)". You remit it to the BIR using Form 1601-EQ (quarterly) and issue each supplier a Form 2307. Until remitted, it's a real liability that accrues penalties if ignored.`, related: ['Withholding Tax Payable (EWT)', 'Cash in Bank'] },
  { category: 'Withholding Tax', question: `Do I withhold on paddy bought from farmers?`, answer: `Generally no — agricultural products in original state from registered suppliers are typically exempt from EWT, and palay/rice is also VAT-exempt. Withholding (1% goods/2% services) applies to your VATable/registered-supplier purchases. When unsure, check the supplier's registration and the product.`, related: ['Inventory – Paddy / Raw Materials', 'Withholding Tax Payable (EWT)'] },

  // ── BIR / Compliance (5) ──
  { category: 'BIR / Compliance', question: `What documents must I keep for the BIR?`, answer: `Keep BIR-registered Sales Invoices (with an approved number series), Official Receipts for collections, supplier invoices, your Form 2307s (both received and issued), bank deposit slips, and your books of accounts (General Journal, General Ledger, subsidiary ledgers, cash books). These support every figure on your tax returns.`, related: [] },
  { category: 'BIR / Compliance', question: `What are the main returns I'll file?`, answer: `VAT return 2550Q (quarterly) if VAT-registered; 1601-EQ (quarterly) to remit EWT you withheld; and income tax 1701Q/1701 (sole proprietor) or 1702Q/1702 (corporation). Non-VAT businesses file 2551Q (3% percentage tax) instead of VAT.`, related: [] },
  { category: 'BIR / Compliance', question: `My Sales Invoices need a "registered series" — what does that mean?`, answer: `BIR requires your invoices and receipts to use an officially authorized number sequence (via ATP or an accredited computerized system). You can't just print random numbers. Under the EOPT rules the Sales Invoice is the primary document — it's what records the sale and any VAT.`, related: [] },
  { category: 'BIR / Compliance', question: `Do I charge VAT if I'm not VAT-registered?`, answer: `No. Non-VAT businesses don't charge 12% VAT; instead they pay a 3% percentage tax and file 2551Q. Whether you're VAT-registered is a registration decision — confirm your status before assuming any VAT treatment.`, related: [] },
  { category: 'BIR / Compliance', question: `Where do I find my BIR / VAT numbers?`, answer: `Open the BIR Compliance page. It pulls straight from your posted ledger and prepares, each tied to its GL control account so they reconcile: a VAT Summary for the 2550Q (Output VAT on VATable sales, less any claimable Input VAT), your Sales and Purchase books, the CWT received register (tax customers withheld from you, with their 2307s), and the EWT withheld / 1601-EQ schedule (tax you held back from suppliers). It does the math and the schedules — it does not e-file or print the BIR forms, so you still file these with your accountant. One open item: Vendo output VAT is still being decided (vendo currently posts zero Output VAT), so the VAT Summary isn't filing-final until that call is made.`, related: ['Output VAT Payable', 'Input VAT – Clearing (Transitional)', 'Withholding Tax Payable (EWT)', 'Creditable Withholding Tax (CWT) Receivable'] },

  // ── Is this normal? (10) — Beru's corrections applied (buying + selling now post); + Treasury (Check Voucher, Cash Position) ──
  { category: 'Is this normal?', question: `Does the system post journal entries automatically?`, answer: `Yes — for everything you do day to day. When you record a Supplier Bill (Dr GR/IR / Cr Accounts Payable, with EWT held back to Withholding Tax Payable) or its Payment (Dr Accounts Payable / Cr Cash), raise a Sales Invoice (Dr Accounts Receivable / Cr Sales — rice is VAT-exempt; VATable goods also Cr Output VAT) or post a Collection (Dr Cash in Bank + Dr CWT Receivable for any tax the customer withheld / Cr Accounts Receivable), complete a Milling Batch, do a Toll Milling job, price a Weighbridge ticket, or log a Vendo cash movement — the system writes the balanced double-entry for you straight into the books. See every entry in Accounting → General Ledger (the journal register plus a per-account ledger with running balances). Posted entries are locked: if something's wrong you reverse it, you don't edit it. Two honest caveats: (1) the cost of the rice you sold (COGS) isn't booked at the moment of sale yet — an invoice records the revenue and the receivable, but not yet the cost of that rice leaving inventory; and (2) the system prepares your tax figures but doesn't e-file or print BIR forms — you still file with your accountant (see the BIR Compliance Q&A).`, related: [] },
  { category: 'Is this normal?', question: `My Balance Sheet / Income Statement is empty — did I break something?`, answer: `No, nothing's broken. Your books are live and filling up — the system now posts both buying and selling (supplier bills, payments, sales invoices, collections) plus milling, toll, weighbridge and vendo, so the General Ledger is populating in real time. Open Accounting → General Ledger for the journal register and each account's running balance. You also now have two finished report pages: DCPR (Daily Collection & Payment Report) for your daily cash in/out per cash account, and BIR Compliance for your VAT, sales/purchase books and withholding schedules. What's still being finished is the fully formatted Balance Sheet and Income Statement report pages — so those two specific pages may look light for now, but the underlying ledger, journal, per-account balances, DCPR and BIR reports are all real and viewable today. (Heads-up: a sale's revenue and receivable show up immediately, but the cost of the rice sold (COGS) isn't booked yet, so profit will look high until that's switched on.)`, related: [] },
  { category: 'Is this normal?', question: `Is the customer's AR balance live, or do I update it by hand?`, answer: `It's live now — no hand-updating. Every Sales Invoice raises the customer's receivable and every Collection lowers it, and those postings keep the customer's AR balance maintained automatically (the updates are idempotency-guarded, so re-running or re-saving won't double-count). That means the credit-hold check on a Sales Order now reads a real, current balance, not a typed-in figure — if a customer is over their limit, that's based on actual unpaid invoices. You can cross-check any customer against the Accounts Receivable – Trade control account and the per-customer subsidiary ledger in Accounting → General Ledger; they should agree. (If a number ever looks surprising, it's usually a collection not yet posted, not a broken balance.)`, related: ['Accounts Receivable – Trade'] },
  { category: 'Is this normal?', question: `I withheld/collected EWT but I don't see it being remitted — is that bad?`, answer: `It's captured and on the books, and you can now see it laid out for filing. The purchase/payment and collection entries post automatically, and the new BIR Compliance page gives you the prepared schedules: your 1601-EQ / EWT-withheld totals, the CWT-received register (tax customers withheld from you), and the Sales and Purchase books — each tied to its GL control account so the figures reconcile. What the system does not yet do is e-file the return or print the Form 2307 certificates (there's no ATC-capture flow yet). So you still remit the EWT to the BIR and issue/collect 2307s manually with your accountant — but now you hand them numbers that are already prepared. Don't skip the manual remittance in the meantime, or you'll accrue penalties.`, related: ['Withholding Tax Payable (EWT)', 'Creditable Withholding Tax (CWT) Receivable'] },
  { category: 'Is this normal?', question: `Where do I see my daily cash in and out?`, answer: `Open the DCPR (Daily Collection & Payment Report). It shows, per cash account (Cash on Hand, each Cash in Bank), the money that came in (collections, vendo, weighbridge, other receipts) and the money that went out (supplier payments, expenses) for each day, with running totals. It's built from the same posted entries as your ledger, so the DCPR ties back to the General Ledger — if a day looks wrong, the matching journal entry is one click away.`, related: ['Cash on Hand', 'Cash in Bank'] },
  { category: 'Is this normal?', question: `How do I pay a supplier?`, answer: `Go to Treasury → Check Voucher. To pay supplier bills: pick the supplier, tick the bill(s) you're paying — one or many, full or partial — choose the cash/bank account, and post. It writes the check voucher and posts Dr Accounts Payable – Trade / Cr Cash. EWT was already withheld when you recorded the bill in Supplier Invoices, so it is not deducted again here.`, related: ['Accounts Payable – Trade', 'Cash in Bank', 'Withholding Tax Payable (EWT)'] },
  { category: 'Is this normal?', question: `Can one check pay several bills?`, answer: `Yes. A single Check Voucher can settle one or many of a supplier's open bills (APVs). You set how much to apply to each bill — full or partial — and the check total is the sum of those amounts. It posts one Dr Accounts Payable line per bill and one Cr Cash for the whole check, from the cash account you chose.`, related: ['Accounts Payable – Trade', 'Cash in Bank'] },
  { category: 'Is this normal?', question: `Where do I see how much cash we have?`, answer: `Open Treasury → Cash Position. It shows your cash on hand plus cash in bank: per cash account it lays out opening → in → out → closing, plus a consolidated total, a closing-balance trend, and a forward projection of upcoming bills due (money going out) versus receivables due (money coming in). It's the liquidity / runway view, built from the same posted entries as your ledger.`, related: ['Cash on Hand', 'Cash in Bank'] },
  { category: 'Is this normal?', question: `What's the difference between DCPR and Cash Position?`, answer: `Same posted data, two lenses. DCPR (under Accounting) is the daily register — every receipt and payment, per cash account, day by day. Cash Position (under Treasury) is the liquidity / position view (DCP) — your balances now (opening → in → out → closing per account and consolidated) plus the projected runway from bills due vs receivables due. Use DCPR to audit the day's movements; use Cash Position to see where you stand and what's coming.`, related: ['Cash on Hand', 'Cash in Bank'] },
  { category: 'Is this normal?', question: `Can I really just leave the Chart of Accounts as-is?`, answer: `Yes. It's pre-seeded specifically for a Philippine rice mill — rice exempt, weighing VATable, the right inventory and tax buckets. Most users review it once and change nothing. You only add accounts if you genuinely do something the chart doesn't cover.`, related: [] },
];

// ── Cheat cards (PART 4) ──────────────────────────────────────────────────────
interface Cheat { event: string; debit: string; credit: string; why: string; }

const CHEAT: Cheat[] = [
  { event: `We received paddy from a farmer (goods in, bill not yet here)`, debit: `Inventory – Paddy / Raw Materials`, credit: `Goods Received Not Invoiced (GR/IR)`, why: `Stock goes up now; the amount owed is parked in GR/IR until the supplier's bill arrives. Palay is VAT-exempt, so no Input VAT.` },
  { event: `The supplier's bill arrived for that paddy`, debit: `Goods Received Not Invoiced (GR/IR)`, credit: `Accounts Payable – Trade (and Withholding Tax Payable (EWT) if you withhold)`, why: `The temporary GR/IR clears into a real payable to the supplier; any EWT you held back is set aside to remit.` },
  { event: `We sold rice on credit`, debit: `Accounts Receivable – Trade`, credit: `Sales – Rice (VAT-exempt)`, why: `Revenue is earned at the sale; the customer owes you. Rice is VAT-exempt, so there is NO Output VAT.` },
  { event: `We milled paddy into rice (internal production)`, debit: `Inventory – Finished Goods (Rice) + Inventory – Bran/Husk (Byproduct)`, credit: `Work-in-Process`, why: `Finished rice and byproducts come out of production. (First, paddy and milling cost flow IN: Dr Work-in-Process / Cr Inventory – Paddy and Cr Milling Conversion Cost.) No VAT — it's a transformation, not a sale.` },
  { event: `We recorded the cost of rice that was delivered/sold (COGS)`, debit: `Cost of Goods Sold`, credit: `Inventory – Finished Goods (Rice)`, why: `When rice leaves inventory to a customer, its cost becomes an expense, matched against the sale.` },
  { event: `Customer paid us and withheld tax (e.g. 1%)`, debit: `Cash in Bank (net received) + Creditable Withholding Tax (CWT) Receivable (the withheld part)`, credit: `Accounts Receivable – Trade (full amount owed)`, why: `They paid you most of it and sent the rest to the BIR for you — that withheld slice is your tax credit. Collect their Form 2307.` },
  { event: `We charged a weighbridge fee, paid in cash (VATable)`, debit: `Cash on Hand`, credit: `Weighing Service Revenue (VATable) + Output VAT Payable (12%)`, why: `Weighing is a taxable service — unlike rice, it carries 12% Output VAT that you owe the BIR.` },
  { event: `We paid the electricity bill`, debit: `Utilities (Electricity, Water)`, credit: `Cash in Bank`, why: `Running costs are expenses (debit-normal); paying them reduces cash.` },
];

// ── Search-result row types ─────────────────────────────────────────────────
interface QAHit extends QA { kind: 'qa'; }
interface GlossaryHit extends GlossaryItem { kind: 'glossary'; }
interface CheatHit extends Cheat { kind: 'cheat'; }
interface FlowHit extends FlowCard { kind: 'flow'; }
interface ModuleHit extends ModuleItem { kind: 'module'; group: string; }
type Tab = 'system' | 'accounting';
type FlowView = 'diagram' | 'steps';

@Component({
  selector: 'app-help-center',
  imports: [FormsModule, Icon, RouterLink],
  template: `
    <!-- ── Hero ── -->
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-ico"><app-icon name="life-buoy" [size]="26" /></div>
      <h1 class="hero-t">Help Center — how the system works &amp; how to use it</h1>
      <p class="hero-sub">One place for the whole ERP. Ask how the system flows, what each module does, or any
        plain-English accounting question — type a phrase (like <em>flow of the system</em>, <em>how does buying work</em>,
        <em>rice</em>, <em>VAT</em>) and I'll find the answer.</p>

      <div class="searchbar">
        <app-icon name="search" [size]="18" />
        <input #searchEl class="search-in" type="search" autocomplete="off"
               placeholder="Search the whole system — flows, modules, accounting…"
               [ngModel]="query()" (ngModelChange)="query.set($event)"
               name="hc-search" aria-label="Search the Help Center" />
        @if (query()) {
          <button class="search-clear" type="button" (click)="clearSearch()" aria-label="Clear search">
            <app-icon name="x" [size]="16" />
          </button>
        }
      </div>

      @if (!query()) {
        <div class="suggests">
          <span class="suggests-l">Try:</span>
          @for (s of SUGGESTIONS; track s) {
            <button class="suggest" type="button" (click)="setQuery(s)">{{ s }}</button>
          }
        </div>
      }
    </section>

    <!-- ── Search results (overlays both tabs) ── -->
    @if (query()) {
      <section class="card mb results">
        <div class="card-h">
          <div class="card-t">
            Results for “{{ query() }}”
            <span class="rcount" aria-live="polite">{{ totalHits() }} {{ totalHits() === 1 ? 'match' : 'matches' }}</span>
          </div>
          <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="clearSearch()">Clear search</button>
        </div>

        @if (totalHits() === 0) {
          <div class="empty">
            <div class="ico"><app-icon name="search" [size]="34" /></div>
            <div class="title">No matches for “{{ query() }}”</div>
            <div class="hint">Try a simpler word, or jump into a topic:</div>
            <div class="chip-row center">
              @for (c of CATEGORIES; track c) {
                <button class="cat-chip" type="button" (click)="browseCategory(c)">{{ c }}</button>
              }
            </div>
          </div>
        } @else {
          <!-- System Flow Q&A and flow cards lead, so "what's the flow?" surfaces first -->
          @if (qaHits().length) {
            <div class="rgroup-h"><app-icon name="message-circle" [size]="14" /> Questions &amp; Answers
              <span class="rgroup-n">{{ qaHits().length }}</span></div>
            <div class="qa-list">
              @for (h of qaHits(); track $index) {
                <details class="qa" [open]="true">
                  <summary class="qa-q">
                    <span class="qa-cat" [class.qa-cat-flow]="h.category === 'System Flow'">{{ h.category }}</span>
                    <span class="qa-qt" [innerHTML]="hl(h.question)"></span>
                    <app-icon class="qa-tw" name="chevron-down" [size]="16" />
                  </summary>
                  <div class="qa-a">
                    <p [innerHTML]="hl(h.answer)"></p>
                    @if (h.related.length) {
                      <div class="rel">
                        <span class="rel-l">Related accounts</span>
                        @for (a of h.related; track a) {
                          <a class="acc-chip" routerLink="/milling/chart-of-accounts"
                             [title]="'Open ' + a + ' in the Chart of Accounts'" [innerHTML]="hl(a)"></a>
                        }
                      </div>
                    }
                  </div>
                </details>
              }
            </div>
          }

          @if (flowHits().length) {
            <div class="rgroup-h"><app-icon name="route" [size]="14" /> System flows
              <span class="rgroup-n">{{ flowHits().length }}</span></div>
            <div class="flow-grid">
              @for (f of flowHits(); track f.id) {
                <div class="flow flow-sm">
                  <div class="flow-h">
                    <span class="flow-t" [innerHTML]="hl(f.title)"></span>
                    <span class="flow-tag" [innerHTML]="hl(f.tag)"></span>
                  </div>
                  <div class="flow-diagram">
                    @for (node of f.diagram; track $index) {
                      <span class="fnode" [innerHTML]="hl(node)"></span>
                      @if (!$last) { <app-icon class="farrow" name="chevron-right" [size]="14" /> }
                    }
                  </div>
                </div>
              }
            </div>
          }

          @if (moduleHits().length) {
            <div class="rgroup-h"><app-icon name="layout-dashboard" [size]="14" /> Modules
              <span class="rgroup-n">{{ moduleHits().length }}</span></div>
            <div class="mod-grid">
              @for (m of moduleHits(); track $index) {
                <div class="mod">
                  <div class="mod-top">
                    <span class="mod-name" [innerHTML]="hl(m.name)"></span>
                    <span class="status-pill" [class]="statusClass(m.status)">{{ m.status }}</span>
                  </div>
                  <div class="mod-grp">{{ m.group }}</div>
                  <div class="mod-what" [innerHTML]="hl(m.what)"></div>
                </div>
              }
            </div>
          }

          @if (glossaryHits().length) {
            <div class="rgroup-h"><app-icon name="book-open" [size]="14" /> Glossary
              <span class="rgroup-n">{{ glossaryHits().length }}</span></div>
            <div class="gloss-grid">
              @for (g of glossaryHits(); track $index) {
                <div class="gloss">
                  <div class="gloss-t" [innerHTML]="hl(g.term)"></div>
                  <div class="gloss-m" [innerHTML]="hl(g.meaning)"></div>
                </div>
              }
            </div>
          }

          @if (cheatHits().length) {
            <div class="rgroup-h"><app-icon name="receipt-text" [size]="14" /> Journal-entry cheat cards
              <span class="rgroup-n">{{ cheatHits().length }}</span></div>
            <div class="cheat-grid">
              @for (c of cheatHits(); track $index) {
                <div class="cheat">
                  <div class="cheat-ev" [innerHTML]="hl(c.event)"></div>
                  <div class="cheat-line"><span class="dc dc-dr">Dr</span><span class="dc-acc" [innerHTML]="hl(c.debit)"></span></div>
                  <div class="cheat-line"><span class="dc dc-cr">Cr</span><span class="dc-acc" [innerHTML]="hl(c.credit)"></span></div>
                  <div class="cheat-why" [innerHTML]="hl(c.why)"></div>
                </div>
              }
            </div>
          }
        }
      </section>
    }

    <!-- ── Browse mode (hidden while searching) ── -->
    @if (!query()) {
      <!-- Tabs -->
      <div class="tabs" role="tablist" aria-label="Help Center sections">
        <button class="tab" type="button" role="tab" [attr.aria-selected]="tab() === 'system'"
                [class.on]="tab() === 'system'" (click)="tab.set('system')">
          <app-icon name="route" [size]="16" /> System Flow &amp; Structure
        </button>
        <button class="tab" type="button" role="tab" [attr.aria-selected]="tab() === 'accounting'"
                [class.on]="tab() === 'accounting'" (click)="tab.set('accounting')">
          <app-icon name="library" [size]="16" /> Accounting
        </button>
      </div>

      @if (tab() === 'system') {
        <!-- Headline flow answer up top -->
        <section class="card mb headline">
          <div class="hl-badge"><app-icon name="route" [size]="15" /> Start here</div>
          <div class="hl-q">{{ headlineQA.question }}</div>
          <p class="hl-a">{{ headlineQA.answer }}</p>
          <div class="hl-jump">
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="scrollTo('flows')">
              <app-icon name="route" [size]="14" /> See the flow cards
            </button>
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="scrollTo('modules')">
              <app-icon name="layout-dashboard" [size]="14" /> Module map
            </button>
            <button class="ph-btn ph-btn-ghost ph-btn-sm" type="button" (click)="browseCategory('System Flow')">
              <app-icon name="message-circle" [size]="14" /> More flow questions
            </button>
          </div>
        </section>

        <!-- Orientation -->
        <section class="card mb">
          <div class="card-h"><div class="card-t"><app-icon name="compass" [size]="14" /> What is this system?</div></div>
          <div class="intro-rows">
            @for (s of SYS_INTRO; track $index) {
              <div class="intro-row">
                <div class="intro-t">{{ s.title }}</div>
                <p class="intro-b">{{ s.body }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Flow cards / diagram -->
        <section class="card mb" id="flows">
          <div class="card-h">
            <div class="card-t"><app-icon name="route" [size]="14" /> The main flows · how documents connect</div>
            <div class="view-toggle" role="group" aria-label="Flow view">
              <button class="vt" type="button" [class.on]="flowView() === 'diagram'"
                      [attr.aria-pressed]="flowView() === 'diagram'" (click)="flowView.set('diagram')">
                <app-icon name="git-fork" [size]="14" /> Diagram
              </button>
              <button class="vt" type="button" [class.on]="flowView() === 'steps'"
                      [attr.aria-pressed]="flowView() === 'steps'" (click)="flowView.set('steps')">
                <app-icon name="clipboard-list" [size]="14" /> Steps
              </button>
            </div>
          </div>
          <p class="flow-intro">Each flow is a chain of documents: a box per document, arrows showing what feeds what.
            <strong>Reaching the books is not the same as moving stock</strong> — several documents now post automatically
            (jade boxes, marked <span class="gl-inline-badge"><app-icon name="book-open" [size]="10" /> GL</span>), but
            Inventory on-hand still only changes through the manual Adjust action.</p>

          @if (flowView() === 'diagram') {
            <!-- Legend -->
            <div class="graph-legend" aria-hidden="false">
              <span class="gl-key"><span class="key-node key-gl"></span> Posts to the books (GL)</span>
              <span class="gl-key"><span class="key-node key-doc"></span> Document</span>
              <span class="gl-key"><span class="key-node key-mat"></span> Material / outcome</span>
              <span class="gl-key"><span class="key-node key-soon"></span> Coming soon</span>
              <span class="gl-key gl-key-hint"><app-icon name="info" [size]="12" /> Click any box for detail</span>
            </div>

            <!-- Per-flow node chains -->
            <div class="graph-list">
              @for (g of FLOW_GRAPHS; track g.flowId) {
                <article class="graph-flow">
                  <div class="flow-h">
                    <span class="flow-t">{{ flowTitle(g.flowId) }}</span>
                    <span class="flow-tag">{{ flowTag(g.flowId) }}</span>
                  </div>

                  <div class="chain">
                    @for (n of g.rows; track n.id) {
                      <button type="button"
                              class="gnode"
                              [class.gnode-gl]="n.postsGL"
                              [class.gnode-mat]="n.kind === 'material'"
                              [class.gnode-soon]="n.comingSoon"
                              [class.on]="isSelected(g.flowId, n.id)"
                              [attr.aria-pressed]="isSelected(g.flowId, n.id)"
                              (click)="selectNode(g.flowId, n)">
                        <span class="gnode-label">{{ n.label }}</span>
                        <span class="gnode-badges">
                          @if (n.code) { <span class="gnode-code">{{ n.code }}</span> }
                          @if (n.postsGL) { <span class="gnode-gl-badge"><app-icon name="book-open" [size]="10" /> GL</span> }
                          @if (n.comingSoon) { <span class="gnode-soon-pill">SOON</span> }
                        </span>
                      </button>
                      @if (!$last) {
                        <span class="conn" aria-hidden="true">
                          <app-icon class="conn-h" name="arrow-right" [size]="16" />
                          <app-icon class="conn-v" name="arrow-down" [size]="16" />
                        </span>
                      }
                    }

                    <!-- Milling-style fan-out: source → 3 outputs, drawn in a bounded SVG -->
                    @if (g.branch) {
                      <span class="conn conn-fork" aria-hidden="true">
                        <app-icon class="conn-h" name="arrow-right" [size]="16" />
                        <app-icon class="conn-v" name="arrow-down" [size]="16" />
                      </span>
                      <div class="fanout" role="group" aria-label="Outputs">
                        <svg class="fan-svg" viewBox="0 0 40 120" preserveAspectRatio="none" aria-hidden="true">
                          <path d="M0 60 H16 M16 20 V100 M16 20 H40 M16 60 H40 M16 100 H40"
                                fill="none" stroke="var(--rim)" stroke-width="1.5" />
                          <path d="M34 16 L40 20 L34 24 M34 56 L40 60 L34 64 M34 96 L40 100 L34 104"
                                fill="none" stroke="var(--rim)" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <div class="fan-nodes">
                          @for (n of g.branch; track n.id) {
                            <button type="button"
                                    class="gnode gnode-mat"
                                    [class.on]="isSelected(g.flowId, n.id)"
                                    [attr.aria-pressed]="isSelected(g.flowId, n.id)"
                                    (click)="selectNode(g.flowId, n)">
                              <span class="gnode-label">{{ n.label }}</span>
                            </button>
                          }
                        </div>
                      </div>
                    }

                    <!-- Per-flow GL terminal: a posting node feeds the books -->
                    @if (showGlTerminal(g.flowId)) {
                      <span class="conn conn-gl" aria-hidden="true">
                        <app-icon class="conn-h" name="arrow-right" [size]="16" />
                        <app-icon class="conn-v" name="arrow-down" [size]="16" />
                      </span>
                      <a class="gnode gnode-gl gnode-glterm" routerLink="/milling/general-ledger"
                         title="Open the General Ledger">
                        <span class="gnode-label"><app-icon name="book-open" [size]="13" /> General Ledger</span>
                        <span class="gnode-badges"><span class="gnode-code">GJ-</span></span>
                      </a>
                    }
                  </div>

                  <!-- Detail reveal for the selected node in THIS flow -->
                  @if (selectedDetail(); as d) {
                    @if (d.flowId === g.flowId) {
                      <div class="gnode-detail" role="region" aria-live="polite" [attr.aria-label]="'Detail for ' + d.node.label">
                        <div class="gd-h">
                          <span class="gd-name">{{ d.node.label }}</span>
                          @if (d.node.code) { <span class="fstep-doc">{{ d.node.code }}</span> }
                          @if (d.node.postsGL) { <span class="gnode-gl-badge"><app-icon name="book-open" [size]="10" /> Posts to GL</span> }
                          @if (d.node.comingSoon) { <span class="status-pill st-soon">COMING SOON</span> }
                          <button class="gd-close" type="button" (click)="clearNode()" aria-label="Close detail">
                            <app-icon name="x" [size]="15" />
                          </button>
                        </div>
                        @if (d.node.blurb) {
                          <p class="fstep-what">{{ d.node.blurb }}</p>
                        }
                        @if (d.step; as s) {
                          <p class="fstep-what">{{ s.what }}</p>
                          @if (s.creates) { <p class="fstep-meta"><span class="meta-l">Feeds next</span> {{ s.creates }}</p> }
                          @if (s.books) {
                            <div class="fstep-books" [class.books-yes]="s.books.startsWith('Yes')"
                                 [class.books-warn]="s.books.startsWith('Known') || s.books.startsWith('Nothing')">
                              <span class="books-l"><app-icon name="book-open" [size]="12" /> In the books</span>
                              <span class="books-tx">{{ s.books }}</span>
                            </div>
                          }
                        }
                      </div>
                    }
                  }
                </article>
              }
            </div>

            <!-- The money shot: operations → the books -->
            <div class="converge">
              <div class="conv-h"><app-icon name="book-open" [size]="15" /> Operations → the books</div>
              <p class="conv-sub">Nearly the whole system now posts automatically the moment you record a document —
                buying (Goods Receipt, Supplier Bill, Payment), selling (Sales Invoice, Collection), milling, toll
                milling, weighbridge, and vendo. They all converge into one place — the General Ledger.</p>
              <div class="conv-diagram">
                <div class="conv-sources">
                  @for (s of GL_SOURCES; track s.label) {
                    <div class="conv-src">
                      <span class="conv-src-label">{{ s.label }}</span>
                      @if (s.code) { <span class="gnode-code">{{ s.code }}</span> }
                    </div>
                  }
                </div>
                <svg class="conv-svg" viewBox="0 0 100 180" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 10 C55 10 45 90 100 90
                           M0 30 C55 30 45 90 100 90
                           M0 50 C55 50 45 90 100 90
                           M0 70 C55 70 45 90 100 90
                           M0 90 H100
                           M0 110 C55 110 45 90 100 90
                           M0 130 C55 130 45 90 100 90
                           M0 150 C55 150 45 90 100 90
                           M0 170 C55 170 45 90 100 90"
                        fill="none" stroke="var(--jade-rim)" stroke-width="1.5" />
                  <path d="M92 86 L100 90 L92 94" fill="none" stroke="var(--jade)"
                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="conv-stack-arrow" aria-hidden="true"><app-icon name="arrow-down" [size]="18" /></span>
                <a class="conv-gl" routerLink="/milling/general-ledger" title="Open the General Ledger">
                  <span class="conv-gl-ico"><app-icon name="book-open" [size]="22" /></span>
                  <span class="conv-gl-t">General Ledger</span>
                  <span class="conv-gl-s">GJ- journal entries</span>
                </a>
              </div>
              <p class="conv-note">The one honest exception is the cost of rice sold (COGS): a Sales Invoice books the
                revenue and the receivable, but the cost of the rice leaving inventory isn't matched at the point of sale
                yet — so profit reads high until costing is switched on.</p>
            </div>
          } @else {
            <!-- Steps view: the original step cards, gated behind the toggle -->
            <div class="flow-list">
              @for (f of FLOWS; track f.id) {
                <article class="flow">
                  <div class="flow-h">
                    <span class="flow-t">{{ f.title }}</span>
                    <span class="flow-tag">{{ f.tag }}</span>
                  </div>
                  <div class="flow-diagram">
                    @for (node of f.diagram; track $index) {
                      <span class="fnode">{{ node }}</span>
                      @if (!$last) { <app-icon class="farrow" name="chevron-right" [size]="14" /> }
                    }
                  </div>
                  <ol class="flow-steps">
                    @for (s of f.steps; track $index) {
                      <li class="fstep" [class.fstep-soon]="s.comingSoon">
                        <div class="fstep-h">
                          <span class="fstep-name">{{ s.name }}</span>
                          @if (s.doc) { <span class="fstep-doc">{{ s.doc }}</span> }
                          @if (s.comingSoon) { <span class="status-pill st-soon">COMING SOON</span> }
                        </div>
                        <p class="fstep-what">{{ s.what }}</p>
                        @if (s.creates) { <p class="fstep-meta"><span class="meta-l">Feeds next</span> {{ s.creates }}</p> }
                        @if (s.books) {
                          <div class="fstep-books" [class.books-yes]="s.books.startsWith('Yes')"
                               [class.books-warn]="s.books.startsWith('Known') || s.books.startsWith('Nothing')">
                            <span class="books-l"><app-icon name="book-open" [size]="12" /> In the books</span>
                            <span class="books-tx">{{ s.books }}</span>
                          </div>
                        }
                      </li>
                    }
                  </ol>
                </article>
              }
            </div>
          }

          <div class="flow-summary">
            <div class="fs-l"><app-icon name="info" [size]="15" /> How it all ties to the books</div>
            <p>{{ FLOW_SUMMARY }}</p>
            <a class="ph-btn ph-btn-primary ph-btn-sm" routerLink="/milling/general-ledger">
              <app-icon name="book-open" [size]="15" /> Open the General Ledger
            </a>
          </div>
        </section>

        <!-- Module map -->
        <section class="card mb" id="modules">
          <div class="card-h">
            <div class="card-t"><app-icon name="layout-dashboard" [size]="14" /> The module map · what each part of the sidebar is for</div>
          </div>
          <div class="mod-legend">
            <span class="status-pill st-live">LIVE</span> working now
            <span class="status-pill st-partial">LIVE (partial)</span> works, one part still being finished
            <span class="status-pill st-soon">COMING SOON</span> visible in the menu, not built yet
          </div>
          @for (grp of MODULE_MAP; track grp.group) {
            <div class="mod-group">
              <div class="mod-group-h">{{ grp.group }}</div>
              <div class="mod-grid">
                @for (m of grp.items; track m.name) {
                  <div class="mod">
                    <div class="mod-top">
                      <span class="mod-name">{{ m.name }}</span>
                      <span class="status-pill" [class]="statusClass(m.status)">{{ m.status }}</span>
                    </div>
                    <div class="mod-what">{{ m.what }}</div>
                  </div>
                }
              </div>
            </div>
          }
        </section>

        <!-- Doc numbering + lifecycles -->
        <section class="card mb">
          <div class="card-h"><div class="card-t"><app-icon name="receipt-text" [size]="14" /> Document numbering &amp; status lifecycles</div></div>
          <p class="dn-intro">Every document gets an automatic number so you never invent one by hand. The leading code tells you what it is:</p>
          <div class="dn-grid">
            @for (d of DOC_CODES; track d.code) {
              <div class="dn-row"><span class="dn-code">{{ d.code }}</span><span class="dn-doc">{{ d.doc }}</span></div>
            }
          </div>
          <div class="lc-h">Documents also move through statuses so you can see where each stands:</div>
          <div class="lc-list">
            @for (lc of STATUS_LIFECYCLES; track lc.doc) {
              <div class="lc-row">
                <span class="lc-doc">{{ lc.doc }}</span>
                <div class="lc-flow">
                  @for (st of lc.flow; track $index) {
                    <span class="lc-stage">{{ st }}</span>
                    @if (!$last) { <app-icon class="lc-arrow" name="chevron-right" [size]="13" /> }
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }

      @if (tab() === 'accounting') {
        <!-- Start here: COA setup walkthrough -->
        <section class="card mb start" id="start-here">
          <div class="card-h">
            <div class="card-t"><app-icon name="sparkles" [size]="14" /> Start here · Set up your Chart of Accounts</div>
          </div>

          <div class="lead">
            <div class="lead-q">What is a Chart of Accounts, in one breath?</div>
            <p>{{ COA_WHAT }}</p>
          </div>

          <div class="before">
            <div class="sub-h">Before you touch anything — 3 things to know</div>
            <ol class="before-list">
              @for (b of COA_BEFORE; track $index) { <li>{{ b }}</li> }
            </ol>
          </div>

          <div class="levels">
            <div class="sub-h">How to read the tree (the 4 levels)</div>
            <div class="level-rows">
              @for (l of COA_LEVELS; track $index) {
                <div class="level-row">
                  <span class="lvl-tag">{{ l.level }}</span>
                  <span class="lvl-tx">{{ l.text }}</span>
                </div>
              }
            </div>
          </div>

          <div class="steps">
            <div class="sub-h">Step-by-step: get your COA ready</div>
            @for (s of COA_STEPS; track s.n) {
              <div class="step">
                <div class="step-n">{{ s.n }}</div>
                <div class="step-body">
                  <div class="step-t">{{ s.title }}</div>
                  <p class="step-tx">{{ s.body }}</p>
                  @if (s.bullets) {
                    <ul class="step-bul">
                      @for (bl of s.bullets; track $index) { <li>{{ bl }}</li> }
                    </ul>
                  }
                </div>
              </div>
            }
          </div>

          <div class="done">
            <div class="sub-h">You're done when…</div>
            <ul class="check-list">
              @for (item of COA_CHECKLIST; track $index) {
                <li>
                  <label class="check">
                    <input type="checkbox" [checked]="checked().has($index)" (change)="toggleCheck($index)" />
                    <span class="check-box"><app-icon name="check" [size]="13" /></span>
                    <span class="check-tx">{{ item }}</span>
                  </label>
                </li>
              }
            </ul>
            <div class="closer"><app-icon name="sparkles" [size]="15" /> {{ COA_CLOSER }}</div>
            <a class="ph-btn ph-btn-primary ph-btn-sm coa-cta" routerLink="/milling/chart-of-accounts">
              <app-icon name="library" [size]="15" /> Open the Chart of Accounts
            </a>
          </div>
        </section>

        <!-- Q&A browser -->
        <section class="card mb" id="qa">
          <div class="card-h">
            <div class="card-t"><app-icon name="message-circle" [size]="14" /> Questions &amp; Answers</div>
            <span class="rcount">{{ QA.length }} answers</span>
          </div>

          <div class="cat-tabs" role="tablist" aria-label="Q&amp;A categories">
            <button class="cat-chip" type="button" [class.on]="activeCat() === null"
                    (click)="activeCat.set(null)">All <span class="cc-n">{{ QA.length }}</span></button>
            @for (c of CATEGORIES; track c) {
              <button class="cat-chip" type="button" [class.on]="activeCat() === c"
                      [class.flow-chip]="c === 'System Flow'" (click)="activeCat.set(c)">
                {{ c }} <span class="cc-n">{{ catCount(c) }}</span>
              </button>
            }
          </div>

          <div class="qa-list">
            @for (h of browseQA(); track $index) {
              <details class="qa">
                <summary class="qa-q">
                  <span class="qa-cat" [class.qa-cat-flow]="h.category === 'System Flow'">{{ h.category }}</span>
                  <span class="qa-qt">{{ h.question }}</span>
                  <app-icon class="qa-tw" name="chevron-down" [size]="16" />
                </summary>
                <div class="qa-a">
                  <p>{{ h.answer }}</p>
                  @if (h.related.length) {
                    <div class="rel">
                      <span class="rel-l">Related accounts</span>
                      @for (a of h.related; track a) {
                        <a class="acc-chip" routerLink="/milling/chart-of-accounts"
                           [title]="'Open ' + a + ' in the Chart of Accounts'">{{ a }}</a>
                      }
                    </div>
                  }
                </div>
              </details>
            }
          </div>
        </section>

        <!-- Glossary -->
        <section class="card mb" id="glossary">
          <div class="card-h">
            <div class="card-t"><app-icon name="book-open" [size]="14" /> Plain-English glossary</div>
            <span class="rcount">{{ GLOSSARY.length }} terms</span>
          </div>
          <div class="gloss-grid">
            @for (g of GLOSSARY; track $index) {
              <div class="gloss">
                <div class="gloss-t">{{ g.term }}</div>
                <div class="gloss-m">{{ g.meaning }}</div>
              </div>
            }
          </div>
        </section>

        <!-- Cheat cards -->
        <section class="card mb" id="cheat">
          <div class="card-h">
            <div class="card-t"><app-icon name="receipt-text" [size]="14" /> Common journal entries · cheat cards</div>
            <span class="rcount">{{ CHEAT.length }} cards</span>
          </div>
          <p class="cheat-note"><span class="dc dc-dr">Dr</span> = Debit (the left side) ·
            <span class="dc dc-cr">Cr</span> = Credit (the right side). Amounts are illustrative.</p>
          <div class="cheat-grid">
            @for (c of CHEAT; track $index) {
              <div class="cheat">
                <div class="cheat-ev">{{ c.event }}</div>
                <div class="cheat-line"><span class="dc dc-dr">Dr</span><span class="dc-acc">{{ c.debit }}</span></div>
                <div class="cheat-line"><span class="dc dc-cr">Cr</span><span class="dc-acc">{{ c.credit }}</span></div>
                <div class="cheat-why">{{ c.why }}</div>
              </div>
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    :host { display: block; animation: fadeUp .4s ease both; max-width: 1080px; margin: 0 auto; }
    .mb { margin-bottom: 18px; }

    /* ── Hero ── */
    .hero {
      position: relative; overflow: hidden; text-align: center;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r12);
      padding: 40px 28px 32px; margin-bottom: 18px;
    }
    .hero-glow {
      position: absolute; top: -60%; left: 50%; transform: translateX(-50%);
      width: 560px; height: 360px; pointer-events: none;
      background: radial-gradient(circle, var(--violet-bg), transparent 68%);
    }
    .hero-ico {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: 16px; margin-bottom: 14px;
      background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-rim);
    }
    .hero-t { position: relative; font-size: 24px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 8px; line-height: 1.25; }
    .hero-sub { position: relative; max-width: 600px; margin: 0 auto 22px; font-size: 13.5px; color: var(--sub); line-height: 1.6; }
    .hero-sub em { font-style: normal; font-weight: 700; color: var(--text); background: var(--gold-bg); padding: 0 5px; border-radius: var(--r4); }

    .searchbar {
      position: relative; display: flex; align-items: center; gap: 10px;
      max-width: 640px; margin: 0 auto;
      background: var(--raised); border: 1.5px solid var(--rim); border-radius: 999px;
      padding: 4px 6px 4px 18px; transition: border-color .15s, box-shadow .15s;
    }
    .searchbar:focus-within { border-color: var(--violet); box-shadow: 0 0 0 4px var(--violet-bg); }
    .searchbar app-icon { color: var(--dim); flex-shrink: 0; }
    .search-in {
      flex: 1; background: none; border: none; outline: none; color: var(--text);
      font: 500 15px var(--font); padding: 12px 0; min-width: 0;
    }
    .search-in::placeholder { color: var(--dim); }
    .search-clear {
      flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--float); color: var(--sub);
    }
    .search-clear:hover { color: var(--text); }

    .suggests { position: relative; margin-top: 16px; display: flex; flex-wrap: wrap; gap: 7px; align-items: center; justify-content: center; }
    .suggests-l { font-size: 11.5px; color: var(--dim); font-weight: 600; }
    .suggest {
      background: var(--surface); border: 1px solid var(--rim); color: var(--sub);
      font-size: 12px; font-weight: 600; padding: 5px 13px; border-radius: 999px; cursor: pointer;
      transition: border-color .12s, color .12s, background .12s;
    }
    .suggest:hover { border-color: var(--violet-rim); color: var(--violet); background: var(--violet-bg); }

    /* ── Tabs ── */
    .tabs { display: flex; gap: 8px; margin-bottom: 18px; }
    .tab {
      display: inline-flex; align-items: center; gap: 8px; flex: 1; justify-content: center;
      background: var(--surface); border: 1px solid var(--border); color: var(--sub);
      font-size: 13.5px; font-weight: 700; padding: 12px 16px; border-radius: var(--r12); cursor: pointer;
      transition: border-color .12s, color .12s, background .12s;
    }
    .tab app-icon { color: var(--dim); }
    .tab:hover { border-color: var(--mist); color: var(--text); }
    .tab.on { background: var(--violet-bg); border-color: var(--violet-rim); color: var(--violet); }
    .tab.on app-icon { color: var(--violet); }

    /* ── Card header icons inline ── */
    .card-t { display: inline-flex; align-items: center; gap: 7px; }
    .card-t app-icon { color: var(--sub); }
    .rcount { font-size: 10.5px; font-weight: 700; color: var(--sub); background: var(--raised); padding: 2px 9px; border-radius: 999px; letter-spacing: .3px; }
    .results .rcount { margin-left: 8px; }

    /* ── Headline flow answer ── */
    .headline { border-left: 3px solid var(--violet); }
    .hl-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--violet); margin-bottom: 10px; }
    .hl-q { font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -.3px; margin-bottom: 10px; line-height: 1.3; }
    .hl-a { font-size: 13.5px; color: var(--sub); line-height: 1.7; margin: 0 0 16px; }
    .hl-jump { display: flex; flex-wrap: wrap; gap: 8px; }

    /* ── Orientation ── */
    .intro-rows { display: flex; flex-direction: column; gap: 14px; }
    .intro-row { padding-left: 14px; border-left: 2px solid var(--rim); }
    .intro-t { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 5px; }
    .intro-b { font-size: 13px; color: var(--sub); line-height: 1.65; margin: 0; }

    /* ── Flow cards ── */
    .flow-intro, .dn-intro { font-size: 12.5px; color: var(--sub); line-height: 1.6; margin-bottom: 16px; }
    .flow-list { display: flex; flex-direction: column; gap: 14px; }
    .flow { border: 1px solid var(--border); border-radius: var(--r8); padding: 16px; background: var(--surface); }
    .flow-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .flow-t { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -.2px; }
    .flow-tag { font-size: 11px; font-weight: 600; color: var(--sub); }
    .flow-diagram {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 4px; margin-bottom: 14px;
      padding: 10px 12px; background: var(--raised); border-radius: var(--r6);
    }
    .fnode { font-size: 11.5px; font-weight: 700; color: var(--text); background: var(--surface); border: 1px solid var(--rim); padding: 4px 9px; border-radius: var(--r6); }
    .farrow { color: var(--dim); flex-shrink: 0; }

    .flow-steps { list-style: none; margin: 0; padding: 0; counter-reset: fstep; display: flex; flex-direction: column; gap: 0; }
    .fstep { padding: 12px 0 12px 38px; position: relative; border-top: 1px solid var(--border); }
    .fstep:first-child { border-top: none; }
    .fstep::before {
      counter-increment: fstep; content: counter(fstep);
      position: absolute; left: 0; top: 12px; width: 26px; height: 26px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      font-family: var(--mono); font-size: 12px; font-weight: 800;
      background: var(--gold); color: var(--gold-text);
    }
    .fstep-soon::before { background: var(--raised); color: var(--dim); border: 1px dashed var(--rim); }
    .fstep-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 5px; }
    .fstep-name { font-size: 13.5px; font-weight: 700; color: var(--text); }
    .fstep-doc { font-family: var(--mono); font-size: 10.5px; font-weight: 700; color: var(--sky); background: var(--sky-bg); border: 1px solid var(--sky-rim); padding: 1px 7px; border-radius: var(--r4); }
    .fstep-what { font-size: 12.5px; color: var(--sub); line-height: 1.6; margin: 0 0 6px; }
    .fstep-meta { font-size: 12px; color: var(--sub); line-height: 1.55; margin: 0 0 6px; }
    .meta-l { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--dim); margin-right: 5px; }
    .fstep-books {
      margin-top: 8px; padding: 9px 11px; border-radius: var(--r6);
      background: var(--raised); border-left: 3px solid var(--mist);
    }
    .fstep-books.books-yes { background: var(--jade-bg); border-left-color: var(--jade); }
    .fstep-books.books-warn { background: var(--gold-bg); border-left-color: var(--gold); }
    .books-l { display: inline-flex; align-items: center; gap: 5px; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--sub); margin-right: 6px; }
    .books-yes .books-l { color: var(--jade-d); }
    .books-tx { font-size: 12px; color: var(--text); line-height: 1.6; }

    .flow-summary { margin-top: 18px; background: var(--sky-bg); border: 1px solid var(--sky-rim); border-radius: var(--r8); padding: 16px 18px; }
    .fs-l { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--sky); margin-bottom: 8px; }
    .flow-summary p { font-size: 13px; color: var(--sub); line-height: 1.7; margin: 0 0 14px; }

    /* compact flow card in search results */
    .flow-grid { display: flex; flex-direction: column; gap: 10px; }
    .flow-sm { padding: 13px 15px; }
    .flow-sm .flow-h { margin-bottom: 9px; }
    .flow-sm .flow-diagram { margin-bottom: 0; }

    /* ── Flow diagram (graph) view ── */
    .view-toggle { display: inline-flex; gap: 2px; background: var(--raised); border: 1px solid var(--rim); border-radius: 999px; padding: 3px; }
    .vt {
      display: inline-flex; align-items: center; gap: 6px; border: none; cursor: pointer;
      background: none; color: var(--sub); font: 700 11.5px var(--font);
      padding: 6px 13px; border-radius: 999px; transition: background .12s, color .12s;
    }
    .vt app-icon { color: var(--dim); }
    .vt:hover { color: var(--text); }
    .vt.on { background: var(--surface); color: var(--violet); box-shadow: 0 1px 2px rgba(15,23,42,.08); }
    .vt.on app-icon { color: var(--violet); }
    .vt:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }

    .gl-inline-badge {
      display: inline-flex; align-items: center; gap: 3px; font-size: 9.5px; font-weight: 800;
      color: var(--jade-d); background: var(--jade-bg); border: 1px solid var(--jade-rim);
      padding: 0 5px; border-radius: var(--r4); vertical-align: middle;
    }
    .gl-inline-badge app-icon { color: var(--jade-d); }

    .graph-legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
      padding: 11px 14px; margin-bottom: 16px;
      background: var(--raised); border-radius: var(--r8); border: 1px solid var(--border);
    }
    .gl-key { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 600; color: var(--sub); }
    .key-node { width: 22px; height: 13px; border-radius: var(--r4); flex-shrink: 0; }
    .key-doc { background: var(--surface); border: 1.5px solid var(--rim); }
    .key-gl { background: var(--jade-bg); border: 1.5px solid var(--jade-rim); border-left: 3px solid var(--jade); }
    .key-mat { background: var(--raised); border: 1.5px dashed var(--mist); }
    .key-soon { background: var(--surface); border: 1.5px dashed var(--rim); opacity: .65; }
    .gl-key-hint { margin-left: auto; color: var(--dim); font-weight: 700; }
    .gl-key-hint app-icon { color: var(--dim); }

    .graph-list { display: flex; flex-direction: column; gap: 18px; }
    .graph-flow { border: 1px solid var(--border); border-radius: var(--r8); padding: 16px; background: var(--surface); }
    .graph-flow .flow-h { margin-bottom: 14px; }

    /* the chain wraps and re-flows; each gap holds a directional connector */
    .chain { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px 0; }

    .gnode {
      display: inline-flex; flex-direction: column; justify-content: center; gap: 5px;
      min-width: 116px; max-width: 200px; text-align: left;
      background: var(--surface); border: 1.5px solid var(--rim); border-radius: var(--r8);
      padding: 9px 12px; cursor: pointer; color: var(--text); text-decoration: none;
      font: inherit; transition: border-color .12s, box-shadow .12s, background .12s;
    }
    .gnode:hover { border-color: var(--violet-rim); box-shadow: 0 2px 8px rgba(15,23,42,.07); }
    .gnode:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
    .gnode.on { border-color: var(--violet); box-shadow: 0 0 0 3px var(--violet-bg); }
    .gnode-label { font-size: 12.5px; font-weight: 700; line-height: 1.25; display: inline-flex; align-items: center; gap: 5px; }
    .gnode-label app-icon { color: var(--jade-d); flex-shrink: 0; }
    .gnode-badges { display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .gnode-code { font-family: var(--mono); font-size: 9.5px; font-weight: 800; color: var(--sky); background: var(--sky-bg); border: 1px solid var(--sky-rim); padding: 1px 6px; border-radius: var(--r4); }

    /* GL-posting node: jade left-border + ledger badge (also legible in grayscale) */
    .gnode-gl { background: var(--jade-bg); border-color: var(--jade-rim); border-left: 3px solid var(--jade); }
    .gnode-gl:hover { border-color: var(--jade); }
    .gnode-gl-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 9px; font-weight: 800; letter-spacing: .3px; color: var(--jade-d); background: var(--surface); border: 1px solid var(--jade-rim); padding: 1px 6px; border-radius: var(--r4); }
    .gnode-gl-badge app-icon { color: var(--jade-d); }

    /* material/outcome node: dashed, softer — not a document */
    .gnode-mat { background: var(--raised); border-style: dashed; border-color: var(--mist); }
    .gnode-mat .gnode-label { font-weight: 600; color: var(--sub); }

    /* coming-soon ghost node */
    .gnode-soon { border-style: dashed; opacity: .7; background: var(--surface); }
    .gnode-soon .gnode-label { color: var(--dim); }
    .gnode-soon-pill { font-size: 8.5px; font-weight: 800; letter-spacing: .4px; color: var(--sub); background: var(--raised); border: 1px solid var(--rim); padding: 1px 6px; border-radius: 999px; }

    /* per-flow GL terminal node */
    .gnode-glterm { min-width: 130px; }

    /* connector between nodes: horizontal arrow inline, vertical arrow when wrapped/stacked */
    .conn { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; align-self: center; color: var(--dim); }
    .conn-v { display: none; }
    .conn-gl .conn-h, .conn-gl .conn-v { color: var(--jade); }

    /* fan-out (milling): bounded SVG, fixed coordinate space — cannot drift */
    /* fan node centers must land at exact 1/6,1/2,5/6 of height so the fixed
       SVG y-coords (20/60/100 of 120) align — so flex:1 + gap:0, no margins. */
    .fanout { display: flex; align-items: stretch; align-self: stretch; }
    .fan-svg { width: 40px; flex-shrink: 0; align-self: stretch; min-height: 132px; }
    .fan-nodes { display: flex; flex-direction: column; }
    .fan-nodes .gnode { flex: 1; min-width: 100px; border-radius: 0; margin: 0; }
    .fan-nodes .gnode:first-child { border-top-left-radius: var(--r8); border-top-right-radius: var(--r8); }
    .fan-nodes .gnode:last-child { border-bottom-left-radius: var(--r8); border-bottom-right-radius: var(--r8); }
    .fan-nodes .gnode + .gnode { border-top: none; }

    /* selected-node detail panel */
    .gnode-detail { margin-top: 14px; padding: 14px 16px; background: var(--raised); border: 1px solid var(--border); border-left: 3px solid var(--violet); border-radius: var(--r8); animation: fadeUp .2s ease both; }
    .gd-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .gd-name { font-size: 14px; font-weight: 800; color: var(--text); }
    .gd-close { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--r6); border: 1px solid var(--rim); background: var(--surface); color: var(--sub); cursor: pointer; flex-shrink: 0; }
    .gd-close:hover { color: var(--text); border-color: var(--mist); }
    .gd-close:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .gnode-detail { animation: none; } }

    /* ── GL convergence "money shot" ── */
    .converge { margin-top: 22px; background: var(--jade-bg); border: 1px solid var(--jade-rim); border-radius: var(--r8); padding: 18px; }
    .conv-h { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: var(--jade-d); margin-bottom: 6px; }
    .conv-h app-icon { color: var(--jade-d); }
    .conv-sub { font-size: 12.5px; color: var(--sub); line-height: 1.6; margin: 0 0 16px; }
    .conv-diagram { display: grid; grid-template-columns: 1fr 56px auto; align-items: stretch; gap: 0; }
    /* sources: flex:1 equal divisions (no gap) so each center lands at an exact
       fifth — matching the SVG's hard-coded y=22/66/110/154/198 of 220. */
    .conv-sources { display: flex; flex-direction: column; }
    .conv-src { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--surface); border: 1px solid var(--jade-rim); border-left: 3px solid var(--jade); padding: 9px 11px; }
    .conv-src:first-child { border-top-left-radius: var(--r6); border-top-right-radius: var(--r6); }
    .conv-src:last-child { border-bottom-left-radius: var(--r6); border-bottom-right-radius: var(--r6); }
    .conv-src + .conv-src { border-top: none; }
    .conv-src-label { font-size: 12px; font-weight: 700; color: var(--text); }
    .conv-svg { width: 56px; align-self: stretch; min-height: 100%; }
    .conv-stack-arrow { display: none; align-items: center; justify-content: center; color: var(--jade); padding: 6px 0; }
    .conv-gl { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center; text-decoration: none; min-width: 132px; padding: 16px 14px; background: var(--surface); border: 2px solid var(--jade); border-radius: var(--r8); color: var(--text); transition: box-shadow .12s; }
    .conv-gl:hover { box-shadow: 0 3px 12px rgba(16,185,129,.22); }
    .conv-gl:focus-visible { outline: 2px solid var(--jade-d); outline-offset: 2px; }
    .conv-gl-ico { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; background: var(--jade-bg); color: var(--jade-d); margin-bottom: 4px; }
    .conv-gl-t { font-size: 14px; font-weight: 800; color: var(--text); }
    .conv-gl-s { font-family: var(--mono); font-size: 10px; font-weight: 700; color: var(--jade-d); }
    .conv-note { font-size: 11.5px; color: var(--sub); line-height: 1.55; margin: 14px 0 0; padding-top: 12px; border-top: 1px dashed var(--jade-rim); }

    /* ── Module map ── */
    .mod-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 11.5px; color: var(--sub); margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    .mod-group { margin-bottom: 18px; }
    .mod-group:last-child { margin-bottom: 0; }
    .mod-group-h { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--sub); margin-bottom: 10px; }
    .mod-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .mod { border: 1px solid var(--border); border-radius: var(--r8); padding: 12px 14px; background: var(--surface); }
    .mod-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .mod-name { font-size: 13px; font-weight: 700; color: var(--text); }
    .mod-grp { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: var(--dim); margin-bottom: 5px; }
    .mod-what { font-size: 12px; color: var(--sub); line-height: 1.55; }

    /* ── Status pills ── */
    .status-pill { flex-shrink: 0; font-size: 9px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .st-live { color: var(--jade-d); background: var(--jade-bg); border: 1px solid var(--jade-rim); }
    .st-partial { color: var(--gold-text); background: var(--gold-bg); border: 1px solid var(--gold-rim); }
    .st-soon { color: var(--sub); background: var(--raised); border: 1px solid var(--rim); }

    /* ── Doc numbering ── */
    .dn-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 20px; }
    .dn-row { display: flex; align-items: baseline; gap: 10px; padding: 7px 11px; background: var(--raised); border-radius: var(--r6); }
    .dn-code { flex-shrink: 0; font-family: var(--mono); font-size: 12px; font-weight: 800; color: var(--violet); min-width: 48px; }
    .dn-doc { font-size: 12px; color: var(--sub); line-height: 1.45; }
    .lc-h { font-size: 12.5px; color: var(--sub); margin-bottom: 12px; }
    .lc-list { display: flex; flex-direction: column; gap: 10px; }
    .lc-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .lc-doc { flex-shrink: 0; min-width: 120px; font-size: 12.5px; font-weight: 700; color: var(--text); }
    .lc-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .lc-stage { font-size: 11px; font-weight: 600; color: var(--sub); background: var(--raised); border: 1px solid var(--rim); padding: 3px 9px; border-radius: var(--r6); }
    .lc-arrow { color: var(--dim); }

    /* ── Category chips / tabs ── */
    .cat-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip-row.center { justify-content: center; margin-top: 14px; }
    .cat-chip {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--raised); border: 1px solid var(--rim); color: var(--sub);
      font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 999px; cursor: pointer;
      transition: border-color .12s, color .12s, background .12s;
    }
    .cat-chip:hover { border-color: var(--mist); color: var(--text); }
    .cat-chip.on { background: var(--gold); color: var(--gold-text); border-color: var(--gold); }
    .cat-chip.flow-chip { border-color: var(--violet-rim); color: var(--violet); }
    .cat-chip.flow-chip.on { background: var(--violet); color: #fff; border-color: var(--violet); }
    .cc-n { font-size: 10px; font-weight: 800; opacity: .75; }
    .cat-chip.on .cc-n { opacity: .85; }

    /* ── Q&A accordion ── */
    .qa-list { display: flex; flex-direction: column; gap: 8px; }
    .qa { border: 1px solid var(--border); border-radius: var(--r8); background: var(--surface); overflow: hidden; transition: border-color .12s; }
    .qa[open] { border-color: var(--rim); }
    .qa:hover { border-color: var(--mist); }
    .qa-q {
      list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px;
      padding: 13px 15px; font-size: 13.5px; font-weight: 600; color: var(--text); user-select: none;
    }
    .qa-q::-webkit-details-marker { display: none; }
    .qa-qt { flex: 1; line-height: 1.45; }
    .qa-cat { flex-shrink: 0; font-size: 9px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--violet); background: var(--violet-bg); border: 1px solid var(--violet-rim); padding: 2px 7px; border-radius: 999px; }
    .qa-cat-flow { color: var(--sky); background: var(--sky-bg); border-color: var(--sky-rim); }
    .qa-tw { color: var(--dim); flex-shrink: 0; transition: transform .18s; }
    .qa[open] .qa-tw { transform: rotate(180deg); }
    .qa-a { padding: 0 15px 15px; }
    .qa-a p { font-size: 13px; color: var(--sub); line-height: 1.65; margin: 0; }
    @media (prefers-reduced-motion: reduce) { .qa-tw { transition: none; } }

    /* related-account chips */
    .rel { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .rel-l { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--dim); margin-right: 2px; }
    .acc-chip {
      font-size: 11px; font-weight: 600; color: var(--sky); background: var(--sky-bg);
      border: 1px solid var(--sky-rim); padding: 3px 9px; border-radius: 999px; white-space: nowrap;
      text-decoration: none; transition: background .12s;
    }
    .acc-chip:hover { background: var(--sky); color: #fff; text-decoration: none; }

    /* ── Search-result groups ── */
    .rgroup-h {
      display: flex; align-items: center; gap: 7px; margin: 18px 0 10px;
      font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--sub);
    }
    .rgroup-h:first-child { margin-top: 4px; }
    .rgroup-h app-icon { color: var(--dim); }
    .rgroup-n { font-size: 10px; color: var(--gold-text); background: var(--gold); padding: 1px 8px; border-radius: 999px; }

    /* ── Glossary ── */
    .gloss-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .gloss { border: 1px solid var(--border); border-radius: var(--r8); padding: 13px 15px; background: var(--surface); }
    .gloss-t { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 5px; }
    .gloss-m { font-size: 12.5px; color: var(--sub); line-height: 1.6; }

    /* ── Cheat cards (Dr sky / Cr violet) ── */
    .cheat-note { font-size: 12px; color: var(--sub); margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .cheat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .cheat { border: 1px solid var(--border); border-radius: var(--r8); padding: 15px; background: var(--surface); }
    .cheat-ev { font-size: 13px; font-weight: 700; color: var(--text); line-height: 1.45; margin-bottom: 12px; }
    .cheat-line { display: flex; align-items: baseline; gap: 9px; margin-bottom: 6px; }
    .dc { flex-shrink: 0; font-size: 9.5px; font-weight: 800; letter-spacing: .4px; padding: 2px 7px; border-radius: var(--r4); font-family: var(--mono); }
    .dc-dr { background: var(--sky-bg); color: var(--sky); border: 1px solid var(--sky-rim); }
    .dc-cr { background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-rim); }
    .dc-acc { font-size: 12.5px; color: var(--text); font-weight: 600; line-height: 1.4; }
    .cheat-why { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 12px; color: var(--sub); line-height: 1.6; }

    /* ── Start-here walkthrough ── */
    .lead { background: var(--raised); border-radius: var(--r8); padding: 16px 18px; margin-bottom: 18px; border-left: 3px solid var(--violet); }
    .lead-q { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
    .lead p { font-size: 13px; color: var(--sub); line-height: 1.65; margin: 0; }
    .sub-h { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--sub); margin-bottom: 12px; }
    .before { margin-bottom: 20px; }
    .before-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
    .before-list li { font-size: 13px; color: var(--sub); line-height: 1.6; }
    .before-list li::marker { color: var(--violet); font-weight: 700; }

    .levels { margin-bottom: 20px; }
    .level-rows { display: flex; flex-direction: column; gap: 8px; }
    .level-row { display: flex; gap: 12px; align-items: baseline; }
    .lvl-tag { flex-shrink: 0; min-width: 116px; font-size: 11px; font-weight: 800; color: var(--gold); background: var(--gold-bg); border: 1px solid var(--gold-rim); padding: 3px 9px; border-radius: var(--r6); text-align: center; }
    .lvl-tx { font-size: 12.5px; color: var(--sub); line-height: 1.6; }

    .steps { margin-bottom: 22px; }
    .step { display: flex; gap: 13px; padding: 13px 0; border-bottom: 1px solid var(--border); }
    .step:last-child { border-bottom: none; }
    .step-n {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      font-family: var(--mono); font-size: 13px; font-weight: 800;
      background: var(--gold); color: var(--gold-text);
    }
    .step-t { font-size: 13.5px; font-weight: 700; color: var(--text); margin-bottom: 4px; line-height: 1.4; }
    .step-tx { font-size: 13px; color: var(--sub); line-height: 1.65; margin: 0; }
    .step-bul { margin: 9px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 7px; }
    .step-bul li { font-size: 12.5px; color: var(--sub); line-height: 1.6; }
    .step-bul li::marker { color: var(--mist); }

    /* checklist */
    .done { background: var(--jade-bg); border: 1px solid var(--jade-rim); border-radius: var(--r8); padding: 18px; }
    .check-list { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .check { display: flex; align-items: flex-start; gap: 11px; cursor: pointer; padding: 6px 4px; border-radius: var(--r6); user-select: none; }
    .check:hover { background: var(--row-hover); }
    .check input { position: absolute; opacity: 0; width: 0; height: 0; }
    .check-box {
      flex-shrink: 0; width: 20px; height: 20px; border-radius: var(--r6); margin-top: 1px;
      border: 1.5px solid var(--rim); background: var(--surface);
      display: inline-flex; align-items: center; justify-content: center; color: transparent;
      transition: background .12s, border-color .12s, color .12s;
    }
    .check input:checked + .check-box { background: var(--jade-d); border-color: var(--jade-d); color: #fff; }
    .check input:focus-visible + .check-box { box-shadow: 0 0 0 3px var(--jade-bg); }
    .check-tx { font-size: 13px; color: var(--text); line-height: 1.55; }
    .check input:checked ~ .check-tx { color: var(--sub); }
    .closer { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 14px; border-top: 1px dashed var(--jade-rim); font-size: 13px; font-weight: 700; color: var(--jade-d); line-height: 1.5; }
    .closer app-icon { flex-shrink: 0; }
    .coa-cta { margin-top: 16px; }

    /* ── Search highlight ── */
    :host ::ng-deep mark { background: var(--gold-bg); color: var(--text); font-weight: 800; padding: 0 2px; border-radius: 3px; }

    /* ── Empty / no-results ── */
    .empty { text-align: center; padding: 30px 18px; color: var(--sub); }
    .empty .ico { color: var(--dim); margin-bottom: 10px; display: flex; justify-content: center; }
    .empty .title { font-size: 15px; color: var(--text); margin-bottom: 4px; font-weight: 700; }
    .empty .hint { font-size: 12.5px; color: var(--sub); }

    @media (max-width: 760px) {
      .gloss-grid, .cheat-grid, .mod-grid, .dn-grid { grid-template-columns: 1fr; }
      .hero-t { font-size: 20px; }
      .lvl-tag { min-width: 90px; }
      .lc-doc { min-width: 100%; }
      .tabs { flex-direction: column; }

      /* Chains stack vertically: nodes full-width, connectors point DOWN */
      .chain { flex-direction: column; align-items: stretch; gap: 0; }
      .gnode { max-width: none; width: 100%; }
      .conn { width: 100%; min-height: 24px; }
      .conn-h { display: none; }
      .conn-v { display: inline-flex; }

      /* Fan-out goes vertical: drop the SVG, stack outputs as a down-list */
      .conn-fork { display: none; }
      .fanout { flex-direction: column; gap: 0; }
      .fan-svg { display: none; }
      .fan-nodes { gap: 0; }
      .fan-nodes .gnode { width: 100%; }
      .fan-nodes .gnode::before {
        content: '↳'; color: var(--dim); font-weight: 800; margin-right: 6px;
      }

      /* Convergence stacks: sources on top, GL below, vertical connector */
      .conv-diagram { grid-template-columns: 1fr; gap: 0; }
      .conv-svg { display: none; }
      .conv-sources { margin-bottom: 0; }
      .conv-src { border-left-width: 3px; }
      .conv-stack-arrow { display: flex; }
      .conv-gl { width: 100%; margin-top: 12px; flex-direction: row; gap: 10px; justify-content: flex-start; }
      .conv-gl-ico { margin-bottom: 0; }
    }
  `,
})
export class HelpCenter {
  // Expose consts to the template.
  readonly QA = QA;
  readonly GLOSSARY = GLOSSARY;
  readonly CHEAT = CHEAT;
  readonly CATEGORIES = CATEGORIES;
  readonly COA_WHAT = COA_WHAT;
  readonly COA_BEFORE = COA_BEFORE;
  readonly COA_LEVELS = COA_LEVELS;
  readonly COA_STEPS = COA_STEPS;
  readonly COA_CHECKLIST = COA_CHECKLIST;
  readonly COA_CLOSER = COA_CLOSER;
  readonly SYS_INTRO = SYS_INTRO;
  readonly MODULE_MAP = MODULE_MAP;
  readonly FLOWS = FLOWS;
  readonly FLOW_GRAPHS = FLOW_GRAPHS;
  readonly GL_SOURCES = GL_SOURCES;
  readonly FLOW_SUMMARY = FLOW_SUMMARY;
  readonly DOC_CODES = DOC_CODES;
  readonly STATUS_LIFECYCLES = STATUS_LIFECYCLES;
  // Each suggestion must be a verbatim (case-insensitive) substring of rendered
  // content, since search is a plain substring match — otherwise the chip lands
  // on the empty state. Backticks keep apostrophes straight (file convention).
  readonly SUGGESTIONS = [`what's the flow of the system`, `how does buying work`, `toll milling`, `rice`, `VAT`, `post journal entries automatically`];

  /** The headline System-Flow answer, pulled by question so it can't drift. */
  readonly headlineQA = QA.find(q => q.question.startsWith(`What's the flow of the system`))!;

  query = signal('');
  tab = signal<Tab>('system');
  activeCat = signal<Category | null>(null);
  checked = signal<Set<number>>(new Set());

  // ── Flow diagram view ──
  flowView = signal<FlowView>('diagram');
  // The node the user clicked, by flow + node id. Drives the inline detail panel.
  selectedNode = signal<{ flowId: string; nodeId: string } | null>(null);

  // Resolve the selected node + its authored step (by stepRef) for the panel.
  selectedDetail = computed<{ flowId: string; node: FlowNode; step?: FlowStep } | null>(() => {
    const sel = this.selectedNode();
    if (!sel) return null;
    const g = FLOW_GRAPHS.find(x => x.flowId === sel.flowId);
    if (!g) return null;
    const node = [...g.rows, ...(g.branch ?? [])].find(n => n.id === sel.nodeId);
    if (!node) return null;
    const flow = FLOWS.find(f => f.id === sel.flowId);
    const step = node.stepRef !== undefined ? flow?.steps[node.stepRef] : undefined;
    return { flowId: sel.flowId, node, step };
  });

  flowTitle(flowId: string): string { return FLOWS.find(f => f.id === flowId)?.title ?? flowId; }
  flowTag(flowId: string): string { return FLOWS.find(f => f.id === flowId)?.tag ?? ''; }
  // Show the inline "→ General Ledger" terminal ONLY when nothing coming-soon sits
  // after the posting node — otherwise the GL arrow would appear to come out of a
  // ghost node, implying it posts, which would be false. Now that buying and
  // selling post end to end (Supplier Bill, Payment, Sales Invoice, Collection),
  // both chains have no ghost after their posting node, so the terminal renders.
  // The guard still protects any future coming-soon tail node.
  showGlTerminal(flowId: string): boolean {
    const g = FLOW_GRAPHS.find(x => x.flowId === flowId);
    if (!g) return false;
    const postIdx = g.rows.findIndex(n => n.postsGL);
    if (postIdx === -1) return false;
    return !g.rows.slice(postIdx + 1).some(n => n.comingSoon);
  }
  isSelected(flowId: string, nodeId: string): boolean {
    const s = this.selectedNode();
    return !!s && s.flowId === flowId && s.nodeId === nodeId;
  }
  selectNode(flowId: string, node: FlowNode) {
    const s = this.selectedNode();
    if (s && s.flowId === flowId && s.nodeId === node.id) { this.selectedNode.set(null); return; }
    this.selectedNode.set({ flowId, nodeId: node.id });
  }
  clearNode() { this.selectedNode.set(null); }

  // Lowercase + fold curly apostrophes/quotes to straight ones so a tablet
  // keyboard's auto-inserted "'" still matches content stored with "'".
  private norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  // Browse-mode Q&A filtered by the active category tab.
  browseQA = computed<QA[]>(() => {
    const cat = this.activeCat();
    return cat === null ? QA : QA.filter(q => q.category === cat);
  });

  // ── Search across every content set ──
  qaHits = computed<QAHit[]>(() => {
    const q = this.norm(this.query().trim());
    if (!q) return [];
    return QA
      .filter(item => this.norm(item.question + ' ' + item.answer + ' ' + item.category + ' ' + item.related.join(' ')).includes(q))
      .map(item => ({ ...item, kind: 'qa' as const }));
  });

  flowHits = computed<FlowHit[]>(() => {
    const q = this.norm(this.query().trim());
    if (!q) return [];
    return FLOWS
      .filter(f => this.norm(f.title + ' ' + f.tag + ' ' + f.diagram.join(' ') + ' ' +
        f.steps.map(s => s.name + ' ' + s.what + ' ' + (s.creates ?? '') + ' ' + (s.books ?? '')).join(' ')).includes(q))
      .map(f => ({ ...f, kind: 'flow' as const }));
  });

  moduleHits = computed<ModuleHit[]>(() => {
    const q = this.norm(this.query().trim());
    if (!q) return [];
    const out: ModuleHit[] = [];
    for (const grp of MODULE_MAP) {
      for (const m of grp.items) {
        if (this.norm(m.name + ' ' + m.what + ' ' + m.status + ' ' + grp.group).includes(q)) {
          out.push({ ...m, kind: 'module', group: grp.group });
        }
      }
    }
    return out;
  });

  glossaryHits = computed<GlossaryHit[]>(() => {
    const q = this.norm(this.query().trim());
    if (!q) return [];
    return GLOSSARY
      .filter(g => this.norm(g.term + ' ' + g.meaning).includes(q))
      .map(g => ({ ...g, kind: 'glossary' as const }));
  });

  cheatHits = computed<CheatHit[]>(() => {
    const q = this.norm(this.query().trim());
    if (!q) return [];
    return CHEAT
      .filter(c => this.norm(c.event + ' ' + c.debit + ' ' + c.credit + ' ' + c.why).includes(q))
      .map(c => ({ ...c, kind: 'cheat' as const }));
  });

  totalHits = computed(() =>
    this.qaHits().length + this.flowHits().length + this.moduleHits().length +
    this.glossaryHits().length + this.cheatHits().length);

  catCount(c: Category): number { return QA.filter(q => q.category === c).length; }

  statusClass(s: ModuleStatus): string {
    return s === 'LIVE' ? 'st-live' : s === 'LIVE (partial)' ? 'st-partial' : 'st-soon';
  }

  setQuery(s: string) { this.query.set(s); }
  clearSearch() { this.query.set(''); }

  private injector = inject(Injector);

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Jump to a Q&A category: exit search, switch to the Accounting tab (which
   * hosts the #qa browser), select the category, then scroll once #qa renders.
   * System Flow questions live in the same #qa list, so the Accounting tab is
   * the correct host for every category.
   */
  browseCategory(c: Category) {
    this.clearSearch();
    this.tab.set('accounting');
    this.activeCat.set(c);
    afterNextRender(
      () => document.getElementById('qa')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
  }

  toggleCheck(i: number) {
    const next = new Set(this.checked());
    if (next.has(i)) next.delete(i); else next.add(i);
    this.checked.set(next);
  }

  /**
   * Highlight query matches as safe HTML: split the text on the (case-insensitive)
   * query and wrap exact matches in <mark>. Source text is HTML-escaped first, so
   * no content markup can inject — only our <mark> tags reach innerHTML.
   */
  hl(text: string): string {
    const q = this.query().trim();
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!q) return esc(text);
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    let out = '', i = 0;
    while (i < text.length) {
      const at = lower.indexOf(ql, i);
      if (at === -1) { out += esc(text.slice(i)); break; }
      out += esc(text.slice(i, at));
      out += '<mark>' + esc(text.slice(at, at + q.length)) + '</mark>';
      i = at + q.length;
    }
    return out;
  }
}
