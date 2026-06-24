# System Structure & Flow — Built-in Help Content (RJL ERP)

> Authored by Jinho (Product / Business Analysis) · 2026-06-13. This file is the SOURCE for the **System Structure & Flow** section of the in-app Help Center — it sits alongside the existing Accounting Assistant content, not replacing it. Plain English for a non-technical rice-mill operator/owner.
> Grounding: live nav (`src/app/shell/shell.ts`), live routes (`src/app/app.routes.ts`), the transaction documentation (`docs/erp-transaction-documentation.md`), and the live database posting engine (bridge triggers + `gl_settings.posting_enabled = true`, verified 2026-06-13).
> For Cha: render PART 1 & PART 2 as guided content, PART 3 as flow "cards" (one card per flow), PART 4 as a short reference block, and PART 5 as a searchable Q&A index using the same `{ category, question, answer }` shape as the Accounting Assistant. The category for every PART 5 item is `"System Flow"`.

---

## PART 1 — What is this system?

**RJL ERP is the operations system for your rice mill.** It is the one place where the whole business is recorded and tracked: buying paddy and supplies, milling paddy into rice, weighing trucks at the weighbridge, selling and delivering rice to customers, running your vending machines ("vendos"), and keeping the books. Instead of notebooks, loose receipts, and separate spreadsheets, every job is entered once as a **document** (a purchase order, a goods receipt, a sales order, a milling batch, a weighbridge ticket, and so on), and the system keeps each document, its number, and its status in order.

**Work is grouped into "workspaces."** A workspace is a whole business unit. Right now the live one is the **Milling** workspace — the rice/grain operation this guide describes. (A second "Hardware" workspace exists as a placeholder for the future.) When you log in you pick a workspace, and everything you do happens inside it.

**Inside a workspace, work is organized into modules** — the items you see in the **left sidebar**. The sidebar is grouped (Overview, Operations, Sales, Procurement, and so on), and each entry opens one module where you do one kind of work. The rest of this guide walks the sidebar (PART 2), then shows how documents flow from one module to the next (PART 3). You do not need to understand accounting to use the system — the books are handled behind the scenes (see the **Accounting Assistant** help for that side).

---

## PART 2 — The module map (what each part of the sidebar is for)

Each line below is **what you do here**, with a tag: **LIVE** (working now), **COMING SOON** (placeholder — visible in the menu but not built yet), or **LIVE (partial)** (works, but one part is still being finished).

### Overview
- **Dashboard** — **LIVE.** Your home screen: the key numbers at a glance (revenue this month, stock alerts, what needs attention).

### Operations
- **Weighbridge** — **LIVE.** Weigh a truck in and out, capture the net weight, price the ticket, and mark it cash or credit.
- **Milling** — **LIVE.** Run production: turn paddy into rice (plus bran and husk), and log toll-milling jobs done for customers.
- **Inventory** — **LIVE (partial).** Your stock master per SKU (on-hand, reserved, value) plus a manual stock-adjustment log. Note: receipts and deliveries do **not** move stock counts automatically yet — only the manual **Adjust** action changes on-hand today (see PART 3, Inventory).
- **Quality Inspection** — **LIVE.** Record the quality check on received material (moisture, impurity, grade) and a pass/reject result.

### Sales
- **Customers** — **LIVE.** Your customer list, with credit limit and balance used by the sales credit check.
- **Sales Orders** — **LIVE.** Take a customer order for rice/goods. Confirming runs a credit-hold check.
- **Delivery** — **LIVE.** Schedule and track the truck dispatch for an order (driver, plate, destination, status).
- **Sales Invoices** — **LIVE.** Issue the customer invoice for an order. Posts Dr Accounts Receivable / Cr Sales (rice is VAT-exempt; VATable goods also Cr Output VAT) and lifts the customer's AR balance.
- **Collections** — **LIVE.** Record the customer's payment / official receipt against an invoice. Posts Dr Cash + Dr CWT Receivable (for any tax they withheld) / Cr AR, and lowers the AR balance.

### Procurement
- **Suppliers** — **LIVE.** Your supplier list (and whether they're BIR-registered, which affects withholding).
- **Purchase Requests** — **LIVE.** Raise an internal request to buy something — the start of the buying flow.
- **Canvasses** — **LIVE (partial).** Open a canvass to compare supplier prices. Today this is a header-only screen; entering individual quotes and picking a winner per item is a planned follow-up, so POs are issued directly for now.
- **Purchase Orders** — **LIVE.** Issue the formal order to a supplier at agreed prices; route it for approval.
- **Goods Receipt** — **LIVE.** Record goods physically arriving against a PO (received vs ordered quantity, with a QC result).
- **Supplier Invoices** — **LIVE.** Record and manage supplier bills (vendor invoices / APVs) against goods receipts. Posts Dr GR/IR → Cr Accounts Payable, holding back Withholding Tax Payable (EWT). This is where you book what you owe a supplier.
- **Items** — **LIVE.** The master list of things you buy (the item catalog used on PRs and POs).
- **Warehouses** — **LIVE.** Your storage locations, used when receiving and holding stock.

### Importation
- **Shipments** — **COMING SOON.** Will track imported shipments and customs clearance. Placeholder for now.

### Accounting
- **Chart of Accounts** — **LIVE.** Your master list of money "buckets," pre-built for a Philippine rice mill. (See the Accounting Assistant for setup help.)
- **General Ledger** — **LIVE.** The actual books — the journal entries that operations create flow in here.
- **Accounts Payable** — **LIVE.** Track what you owe suppliers: record a supplier bill against a receipt, then pay it. Both post to the General Ledger automatically.
- **Accounts Receivable** — **LIVE.** Track what customers owe you: invoice a confirmed/delivered order to post AR, then record collections against it. The balance is maintained automatically and feeds the sales credit check.
- **DCPR** — **LIVE.** Daily Collection & Payment Report — money in and money out per cash account, per day, built from your posted ledger.
- **BIR Compliance** — **LIVE.** Prepared VAT, sales/purchase books, and withholding schedules pulled from your posted ledger — for filing with your accountant (it doesn't e-file or print BIR forms).

### Treasury
- **Check Voucher** — **LIVE.** Pay one OR many supplier bills (APVs) in a single check: posts one Dr Accounts Payable line per bill + one Cr Cash from the chosen cash account. Supports full or partial payment and void. EWT is not re-applied here — it was already withheld when the bill was recorded.
- **Cash Position** — **LIVE.** Daily cash position (DCP) / liquidity view: per cash account Opening → Inflows → Outflows → Closing plus a consolidated total, a closing-balance trend, and an indicative forward projection (bills due as outflows vs receivables due as inflows).

### HR & Reports
- **Employees** — **COMING SOON.** Staff records. Placeholder for now.
- **Payroll** — **COMING SOON.** Pay runs. Placeholder for now.
- **Reports** — **COMING SOON.** Cross-module reports. Placeholder for now.
- **Vendos** — **LIVE.** Your vending machines and their cash in/out movements.

### Help
- **Help Center** — **LIVE.** Built-in, plain-English help for the whole system — the module map, the flows, and the accounting answers (this page).

---

## PART 3 — The main flows (how documents connect)

This is the heart of "what's the flow of the system?" Each flow below is one **card**: an arrow diagram, then each step with **What you do**, **What it creates**, and **What feeds the next step**. A short "In the books" line says, in plain terms, what (if anything) reaches the General Ledger today — for the accounting detail, see the Accounting Assistant.

> One thing to keep straight throughout: **"reaches the books" is not the same as "moves stock."** Several documents now create an accounting entry automatically, but the **Inventory** on-hand counts still only change through the manual **Adjust** action (a known upcoming improvement). Both facts are noted where they matter.

---

### FLOW 1 — Procure-to-Pay (buying)

```
Purchase Request → Canvass → Purchase Order → Goods Receipt → Quality Inspection → Supplier Invoice → Check Voucher
```

1. **Purchase Request (PR)**
   - **What you do:** Someone needs to buy something; you raise a request listing the items and quantities.
   - **What it creates:** A PR document (number `PR-…`).
   - **Feeds next step:** The PR is the basis for shopping around (the Canvass) and, ultimately, the order.

2. **Canvass**
   - **What you do:** Compare supplier prices for the requested items. *(Today this is a header-only screen; detailed quote entry and picking a winner per item are a planned follow-up, so in practice you often go straight to the PO.)*
   - **What it creates:** A canvass document (number `CNV-…`).
   - **Feeds next step:** Tells you which supplier and price to put on the Purchase Order.

3. **Purchase Order (PO)**
   - **What you do:** Issue the formal order to the chosen supplier at agreed prices, then route it for approval. A PO moves **pending approval → approved**, and later → received once goods arrive.
   - **What it creates:** A PO document (number `PO-…`). For non-BIR-registered suppliers it also works out the withholding-tax (EWT) figure for reference.
   - **Feeds next step:** When the goods arrive, you receive them **against this approved PO**, and the PO's prices value the receipt.

4. **Goods Receipt (GRN)**
   - **What you do:** When goods physically arrive, pick the open PO and record what actually came in (received vs ordered quantity, plus a quality result).
   - **What it creates:** A goods-receipt document (number `GRN-…`), and it flips the PO to **received**.
   - **In the books:** **Yes — this now reaches the General Ledger automatically.** Receiving the goods records the **value of the stock received** and the **amount you owe the supplier** (parked in a "goods received, not yet invoiced" bucket until the supplier's bill arrives). *Note:* this records the accounting value but does **not** yet bump your Inventory on-hand count — that's still manual today. See the Accounting Assistant for the journal-entry detail.
   - **Feeds next step:** The received goods can be sent for a Quality Inspection, and (once built) matched to the supplier's bill.

5. **Quality Inspection (QC)**
   - **What you do:** Record the lab/visual check on the received material — moisture, impurity, grade — and a pass / partial-reject / reject verdict.
   - **What it creates:** A QC record (number `QC-…`) linked to the receipt.
   - **In the books:** Nothing posts; this is a quality workflow step (a rejection may justify a dispute on the receipt).

6. **Supplier Invoice / Bill**
   - **What you do:** Record the supplier's bill against the receipt.
   - **What it creates:** A supplier-bill document (number `SB-…`).
   - **In the books:** **Yes — posts to the General Ledger automatically.** It clears the "goods received, not yet invoiced" bucket into a real payable: Dr Goods Received Not Invoiced (GR/IR) / Cr Accounts Payable – Trade, with any expanded withholding tax (EWT) held back to Withholding Tax Payable.
   - **Feeds next step:** The outstanding bill (APV) is what a Check Voucher settles.

7. **Check Voucher (CV)**
   - **What you do:** Pay supplier bills. A single Check Voucher can settle **one OR many** of a supplier's open bills (APVs) in one check — pick the supplier, tick the bill(s), apply a full or partial amount to each, choose the cash/bank account, and post. A CV can also be voided. EWT is **not** re-applied here — it was already withheld when each bill was recorded. This is how a recorded bill (APV) gets settled.
   - **What it creates:** A check-voucher document (number `CV-…`).
   - **In the books:** **Yes — posts to the General Ledger automatically.** One **Dr Accounts Payable – Trade line per bill** + one **Cr Cash** for the full check, from the chosen cash account. The procure-to-pay chain now flows fully into the books.

---

### FLOW 2 — Order-to-Cash (selling)

```
Sales Order → Delivery → Sales Invoice → Collection
```

1. **Sales Order (SO)**
   - **What you do:** Take a customer's order for rice/goods. Save it as a draft, or **Confirm** it. On confirm, the system runs a **credit-hold check**: if the customer is over their credit limit / flagged, the order is held on **credit hold** instead of confirmed.
   - **What it creates:** An SO document (number `SO-…`).
   - **Feeds next step:** A confirmed order is what you dispatch against.

2. **Delivery (DO)**
   - **What you do:** Schedule the truck for a confirmed order — driver, plate, destination — and advance it **scheduled → in transit → delivered**.
   - **What it creates:** A delivery document (number `DO-…`).
   - **In the books:** Nothing posts yet, and stock is not reduced automatically — the delivery record is a logistics record today.
   - **Feeds next step:** The customer's bill — the Sales Invoice.

3. **Sales Invoice (SI)**
   - **What you do:** Bill the customer for the order — the document that records the sale, the receivable, and any VAT. It now has its own dedicated page under **Sales → Sales Invoices.** Raising it lifts the customer's AR balance automatically.
   - **What it creates:** A sales-invoice document (number `SI-…`).
   - **In the books:** **Yes — posts to the General Ledger automatically.** Dr Accounts Receivable – Trade / Cr Sales (rice is VAT-exempt; VATable goods also Cr Output VAT). *Caveat:* the cost of the rice sold (COGS) is still deferred — an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory.
   - **Feeds next step:** The unpaid invoice is what a Collection settles.

4. **Collection (OR)**
   - **What you do:** Record the customer's payment against their invoice. It now has its own dedicated page under **Sales → Collections.** Lowers the customer's AR balance automatically.
   - **What it creates:** A collection document with an official-receipt number (number `OR-…`).
   - **In the books:** **Yes — posts to the General Ledger automatically.** Dr Cash (plus Creditable Withholding Tax Receivable for any tax the customer withheld) / Cr Accounts Receivable – Trade. Selling now posts end to end, just like buying, milling, toll, weighbridge, and vendo.

---

### FLOW 3 — Milling (your own production)

```
Paddy in → Milling Batch (planned → in progress → completed) → Rice + Bran + Husk out
```

1. **Milling Batch**
   - **What you do:** Start a production run: how much paddy goes in, then record the rice, bran, and husk that come out, the **recovery %**, and the cost. Advance the batch **planned → in progress → completed**.
   - **What it creates:** A milling-batch document (number `MB-…`).
   - **In the books:** **Yes — when you mark the batch completed, it posts to the General Ledger automatically.** In plain terms, it records paddy moving out of raw materials, through "work-in-process," and into **finished rice plus byproducts** at cost — no sale, no VAT, because it's a transformation, not a sale. (Stock counts in the Inventory module are not auto-updated yet.) See the Accounting Assistant for the journal-entry detail.

---

### FLOW 4 — Toll Milling (milling service for a customer)

```
Customer's paddy → Toll Milling job (per-sack fee) → Service revenue
```

1. **Toll Milling job**
   - **What you do:** A customer brings their **own** paddy to be milled for a per-sack fee. Log the job: sacks in, outputs, recovery %, the fee, and who keeps the byproducts.
   - **What it creates:** A toll-milling record with an official-receipt number (number `TM-…`).
   - **In the books:** **Yes — posts automatically.** Because the grain is the customer's, none of it is your inventory; you simply earn a **service fee** (cash in, toll-milling revenue — VAT-exempt for palay-to-rice). See the Accounting Assistant for detail.

---

### FLOW 5 — Weighbridge

```
Weigh vehicle (gross/tare → net) → Priced ticket (cash or credit) → Revenue + VAT
```

1. **Weighbridge ticket**
   - **What you do:** Weigh the vehicle, capture the net weight, set the price, and mark it **cash** or **credit**.
   - **What it creates:** A weighbridge ticket with an official-receipt number (number `WT-…`).
   - **In the books:** **Yes — a priced ticket posts automatically.** Weighing is a **taxable service**, so the ticket records the weighing **revenue plus 12% output VAT**, with the money going to cash (or to "what the customer owes" for a credit ticket). An unpriced/pending ticket doesn't post. See the Accounting Assistant for detail.

---

### FLOW 6 — Vendo (vending machines)

```
Vendo machine → Log a cash movement (income or expense)
```

1. **Vendo cash movement**
   - **What you do:** For each machine, log money **in** (a coin-drop/sale) or money **out** (a refill or repair cost).
   - **What it creates:** A vendo entry against that machine.
   - **In the books:** **Yes — posts automatically.** An **income** entry records cash in and vendo sales; an **expense** entry records the cost and cash out. See the Accounting Assistant for detail.

---

### FLOW 7 — Inventory (stock master + adjustments)

```
SKU master  ──manual Adjust──▶  stock movement log
```

1. **Inventory**
   - **What you do:** Keep a master record per SKU (on-hand, reserved, available, value, reorder point), and change stock with the manual **Adjust** action.
   - **What it creates:** An updated on-hand figure plus a movement log entry.
   - **Important known limitation:** **Receiving goods (GRN) and making deliveries do NOT move stock counts automatically yet.** Today, only the manual **Adjust** action changes on-hand. Wiring receipts/deliveries/milling to move stock automatically is a known upcoming item. So treat on-hand as something you currently keep accurate by adjusting, not something the buy/sell flow updates for you.

---

### How it all ties to the books (short version)

Nearly all of your **operational documents now flow into the General Ledger automatically** through a behind-the-scenes posting engine: **buying (Goods Receipt, Supplier Bill, Check Voucher), selling (Sales Invoice, Collection), completed Milling Batches, Toll Milling, priced Weighbridge tickets, and Vendo cash movements** each create a balanced accounting entry the moment you record them. The one honest exception is the **cost of rice sold (COGS)** — a Sales Invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory, so that's matched separately once costing is switched on. You don't have to do anything to make posting happen; it's automatic when posting is switched on. The entries themselves are kept permanent (they can be reversed but not silently edited). The resulting liquidity — cash on hand and in bank, opening → in → out → closing per account and a forward projection — shows up in **Treasury → Cash Position (DCP).** For *what each entry means* in accounting terms, see the **Accounting Assistant** help.

---

## PART 4 — Document numbering & status lifecycles (brief)

**Every document gets an automatic number** so you never invent one by hand. The number starts with a short code telling you what it is:

| Code | Document |
|---|---|
| `PR-` | Purchase Request |
| `CNV-` | Canvass |
| `PO-` | Purchase Order |
| `GRN-` | Goods Receipt |
| `QC-` | Quality Inspection |
| `SB-` | Supplier Invoice / Bill |
| `CV-` | Check Voucher (payment to supplier) |
| `SO-` | Sales Order |
| `DO-` | Delivery |
| `SI-` | Sales Invoice |
| `OR-` | Collection (Official Receipt) |
| `MB-` | Milling Batch |
| `TM-` | Toll Milling |
| `WT-` | Weighbridge Ticket |
| `GJ-` | General Journal entry (the accounting entry the system posts behind the scenes) |

**Documents also move through statuses** so you can see where each one stands. A few examples:
- A **Purchase Order**: pending approval → approved → received.
- A **Sales Order**: draft → confirmed (or **credit hold**) → in transit → delivered.
- A **Delivery**: scheduled → in transit → delivered.
- A **Milling Batch**: planned → in progress → completed.

You don't manage the numbers; you just move documents along their status as the real work happens.

---

## PART 5 — System Flow Q&A (for the Help Center index)

> For Cha: render as `{ category: "System Flow", question, answer }` items, same shape and search behavior as the Accounting Assistant Q&A. Lead with "What's the overall flow of the system?" — it's the headline question.

```js
const SYSTEM_FLOW_QA = [
  {
    category: "System Flow",
    question: "What's the overall flow of the system?",
    answer: "RJL ERP follows two big flows plus a few standalone ones, all inside the Milling workspace. BUYING (Procure-to-Pay): you raise a Purchase Request, compare prices in a Canvass, issue a Purchase Order to a supplier, record a Goods Receipt when the goods arrive, run a Quality Inspection, then record the Supplier Bill and the Payment. SELLING (Order-to-Cash): you take a Sales Order (confirming runs a credit-hold check), schedule a Delivery, then raise a Sales Invoice and record the Collection. Alongside these: MILLING turns your paddy into rice, bran, and husk; TOLL MILLING is the same service done on a customer's own paddy for a fee; the WEIGHBRIDGE prices truck weighings; VENDOS log vending-machine cash; and INVENTORY holds your stock master. Each step creates a numbered document that feeds the next step. And nearly every operational document now posts to the General Ledger automatically — buying (Goods Receipt, Supplier Bill, Payment), selling (Sales Invoice, Collection), completed Milling, Toll Milling, priced Weighbridge tickets, and Vendo movements all reach the books. The one thing still deferred is the cost of rice sold (COGS) at the point of sale."
  },
  {
    category: "System Flow",
    question: "How does buying work end to end?",
    answer: "Purchase Request → Canvass → Purchase Order → Goods Receipt → Quality Inspection → Supplier Bill → Payment. You request what's needed, compare supplier prices (the Canvass is header-only for now, so POs are often issued directly), issue and approve the PO, then record the Goods Receipt when goods arrive — which flips the PO to 'received' and posts the stock value and what you owe the supplier to the books automatically. A Quality Inspection records the quality check. Then you record the Supplier Bill (which clears the 'goods received, not yet invoiced' bucket into a real payable, holding back any EWT) and the Payment (clearing the payable, cash out) — both post to the General Ledger automatically, so the buying chain now flows fully into the books."
  },
  {
    category: "System Flow",
    question: "How does selling work?",
    answer: "Sales Order → Delivery → Sales Invoice → Collection. You enter the customer's order; confirming it runs a credit-hold check (over-limit customers are held). Then you schedule and track the Delivery. You raise a Sales Invoice — which records the sale, lifts the customer's receivable (Dr AR / Cr Sales; rice is VAT-exempt, VATable goods also Cr Output VAT) — and record the Collection when they pay (Dr Cash, plus CWT Receivable for any tax they withheld / Cr AR). Both post to the General Ledger automatically. The one thing still deferred is the cost of the rice sold (COGS) at the point of sale."
  },
  {
    category: "System Flow",
    question: "Where does milling fit?",
    answer: "Milling is its own production flow, separate from buying and selling. You open a Milling Batch, record the paddy in and the rice/bran/husk out (with recovery % and cost), and advance it to completed. When it's completed, the system posts a 'work-in-process to finished-goods' entry to the books automatically — paddy is consumed and finished rice plus byproducts are produced at cost. It's a transformation, not a sale, so there's no VAT."
  },
  {
    category: "System Flow",
    question: "What's the difference between Milling and Toll Milling?",
    answer: "In Milling you process YOUR OWN paddy into rice to sell later — the grain is your inventory. In Toll Milling a customer brings THEIR OWN paddy and pays you a per-sack fee to mill it — the grain never becomes your stock, so you only earn a service fee (VAT-exempt for palay-to-rice). Both are in the Milling module; toll jobs get a TM- receipt number and post the fee as service revenue automatically."
  },
  {
    category: "System Flow",
    question: "What happens after I receive goods?",
    answer: "Recording a Goods Receipt does three things: it creates a GRN- document, it flips the matching Purchase Order to 'received', and it posts to the books automatically — recording the value of the stock received and the amount you owe the supplier (held in a 'received but not yet invoiced' bucket). You can then run a Quality Inspection on the material. One thing it does NOT do yet: it doesn't bump your Inventory on-hand count automatically — that's still done with the manual Adjust action today."
  },
  {
    category: "System Flow",
    question: "How does a sale become money in the books?",
    answer: "Automatically, through two steps. The Sales Invoice turns a sale into revenue and a receivable (Dr Accounts Receivable / Cr Sales — rice is VAT-exempt; VATable goods also Cr Output VAT), and the Collection records the customer's payment (Dr Cash, plus CWT Receivable for any tax they withheld / Cr Accounts Receivable). Both post to the General Ledger the moment you save them, just like buying, milling, toll, weighbridge, and vendo. The only piece still deferred is the cost of the rice sold (COGS) — an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory."
  },
  {
    category: "System Flow",
    question: "Does receiving or delivering goods update my stock levels?",
    answer: "Not yet. Right now your Inventory on-hand count only changes through the manual Adjust action in the Inventory module. Goods Receipts and Deliveries are recorded (and a receipt even posts its value to the books), but they don't move the on-hand quantity automatically. Wiring receipts, deliveries, and milling to move stock for you is a known upcoming improvement — for now, keep on-hand accurate by adjusting it."
  },
  {
    category: "System Flow",
    question: "Which modules are live vs coming soon?",
    answer: "LIVE: Dashboard; Weighbridge, Milling, Inventory, Quality Inspection; Customers, Sales Orders, Delivery, Sales Invoices, Collections, Accounts Receivable, DCPR; Suppliers, Purchase Requests, Canvasses, Purchase Orders, Goods Receipt, Supplier Invoices, Items, Warehouses; Chart of Accounts, General Ledger, Accounts Payable, BIR Compliance; Check Voucher and Cash Position (Treasury); Vendos; and this Help Center. COMING SOON (placeholders in the menu): Importation/Shipments; Employees, Payroll, Reports; and the formatted Balance Sheet / Income Statement report pages. Two live-but-partial spots: the Canvass screen is header-only (detailed quotes/winner picking deferred), and Inventory doesn't auto-receive from Goods Receipts yet."
  },
  {
    category: "System Flow",
    question: "How do documents connect to each other?",
    answer: "Each document is created from the one before it and feeds the one after. A Purchase Request leads to a Canvass and then a Purchase Order; the PO is what you receive against in a Goods Receipt; the receipt can be inspected in Quality Inspection. On the sales side, a Sales Order is what you dispatch against in a Delivery. Each document keeps a reference to its source (for example, a Goods Receipt knows which PO it's for), so you can trace any document back to where it started. Every document also carries its own auto number (PR-, PO-, GRN-, SO-, DO-, and so on)."
  },
  {
    category: "System Flow",
    question: "What is a workspace?",
    answer: "A workspace is a whole business unit you work inside. The live one is the Milling workspace — the rice/grain operation this help describes. (A Hardware workspace exists as a future placeholder.) You pick a workspace after logging in, and the left-sidebar modules belong to that workspace."
  },
  {
    category: "System Flow",
    question: "Do I have to do anything to post to the books?",
    answer: "No. When posting is switched on (it is), the operational documents that have accounting meaning post themselves the moment you record them: Goods Receipt, Supplier Bill, Payment, Sales Invoice, Collection, a completed Milling Batch, Toll Milling, a priced Weighbridge ticket, and Vendo cash movements. You just do your normal work. The posted entries are permanent — they can be reversed but not quietly edited. For what each entry means, see the rest of the Accounting Assistant."
  }
];
```

---

## Notes for the team (not for rendering)

- **Module sync (2026-06-14):** added the modules that shipped since the last Help Center sync, all LIVE with their own sidebar entries — **Procurement → Supplier Invoices** (`SB-`), **Sales → Sales Invoices** (`SI-`) and **Sales → Collections** (`OR-`), **Treasury → Check Voucher** (`CV-`, via `next_doc_no('CV')` / `rpc_post_cv` → one Dr AP line per bill + one Cr cash; EWT not re-applied), and **Treasury → Cash Position** flipped COMING SOON → LIVE (DCP liquidity view). The Procure-to-Pay payment step is now the **Check Voucher (CV)** (was the generic "Payment / PV-"). The live-vs-coming-soon Q&A and the document-numbering table were updated to match. New searchable Q&A for these (record a supplier's bill, pay a supplier / one check many bills, where's my cash, DCPR vs Cash Position, where to issue an invoice / record a payment) were added to the in-app Help Center under existing Q&A categories (Purchases & Milling, Sales & Collections, Is this normal?) — no new category was introduced. Grounding: live nav (`shell.ts`), routes (`app.routes.ts`), and `rpc_post_cv`/`supplier_payments` (verified the CV prefix is `CV-`).
- **Resolved (2026-06-14):** the Beru scope-flag below is now actioned — buying *and* selling post end to end (Supplier Bill, Payment, Sales Invoice, Collection added to the bridge), AR/AP/DCPR/BIR Compliance are live pages, and the Accounting Assistant "Is this normal?" answers were refreshed to match (posting live across the board; statements populate from posted entries; AR balance is now maintained automatically; the one remaining caveat is COGS-at-sale, not selling). Both this doc and `accounting-assistant-content.md` were updated in the same pass so the Help Center no longer contradicts itself.
- **Original scope flag for Beru (now done):** the Accounting Assistant "Is this normal?" Q&A used to tell users posting was "the NEXT build / not yet live" and that financial statements were empty because the ledger wasn't on. That had become contradicted by reality — see Resolved above.
- **Accuracy basis:** live-vs-coming-soon is taken from `app.routes.ts` (`ph()` = placeholder). Posting behavior is taken from the live bridge triggers (`fn_bridge_grn/_milling/_toll/_vendo/_weighbridge`, plus the supplier-bill/payment/sales-invoice/collection posting paths) and `fn_post_je` (journal series `GJ`). I deliberately kept the accounting detail light and pointed to the Accounting Assistant, since that content owns the journal entries.
