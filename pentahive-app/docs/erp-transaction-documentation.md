# PENTAHIVE / RJL ERP — Transaction Documentation

> Audience: Product Owner. Purpose: understand what each transaction in the system does, how documents flow into each other, and which transactions matter for the books.
> Grounding: This document is derived from the **live Supabase schema** (project `zpfkhcnxtiyojodtmepn`) and the **actual Angular component code** under `src/app/`. Where the schema or code is silent or ambiguous, it is flagged as an open question rather than assumed.
> Last reviewed: 2026-06-13.

---

## 1. Overview

PENTAHIVE / RJL is an operations ERP for an **agri / rice-milling business** that also runs a procurement function, a sales/distribution function, a weighbridge, and a fleet of vending machines ("vendos"). It is built on **Angular 21 + Supabase (Postgres)**.

The system today is best understood as a **transaction-capture and workflow layer**. It records business documents and moves them through status lifecycles, and it computes operational KPIs (recovery %, pass rate, revenue MTD, credit availability). It does **not yet contain an automated general-ledger / posting engine**: there are no posting triggers, and most "economic" side-effects (inventory movement on receipt/delivery, AR/AP balances, VAT, EWT remittance) are either captured as metadata or not captured at all. See Section 5 for the full list of gaps.

This is the single most important framing for the rest of this document, and it is why the per-transaction reference uses **two separate columns**:

- **Accounting significance** — the *economic meaning* of the transaction type (what it would mean to the books in a complete accounting system). This drives Section 4 (Beru's worklist).
- **Posts to the books today?** — what the *current implementation* actually does. For almost every transaction this is **No** — the app records the document but does not generate journal entries or update financial balances.

### Two main process flows

**Procure-to-Pay (P2P)** — buying goods/services:

> Purchase Request (PR) → Canvass (supplier bids) → Purchase Order (PO) → Goods Receipt (GRN) → Quality Inspection (QC) → [Supplier Invoice / AP — not in system] → [Payment — not in system]

**Order-to-Cash (O2C)** — selling rice/goods:

> Sales Order (SO) → Delivery (DO) → Sales Invoice (SI) → Collection (OR)
> (Note: in the current build the chain is implemented only as far as **SO → DO**. Sales Invoice and Collection tables exist in the schema but **no UI writes them yet**.)

**Supporting / standalone flows:**

- **Inventory** — SKU master with on-hand/reserved/value; `inventory_transactions` logs movements. Today only the manual **Adjust** action moves stock.
- **Internal milling** (`milling_batches`) — converts paddy to rice/bran/husk; tracks recovery and cost.
- **Toll milling** (`toll_milling`) — milling service performed for a customer for a per-sack fee (service revenue).
- **Weighbridge** (`weighbridge_tickets`) — vehicle weighing with a price and cash/credit flag.
- **Vendos** (`vendos` + `vendo_entries`) — vending machines and their cash income/expense movements.

### Document numbering

All transactional documents draw their human-readable number from a shared sequence via the RPC `next_doc_no(p_series)`, backed by the `doc_counters` table (`series`, `year`, `last_no`). Observed series codes in code: `PR`, `CNV`, `PO`, `GRN`, `SO`, `DO`, `QC`, `MB` (milling batch), `TM` (toll milling), `WT` (weighbridge). No series code was found in code for `sales_invoices` or `collections` (consistent with there being no writer yet).

---

## 2. Process flow diagrams

### Procure-to-Pay

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ Purchase Request │ ──▶ │   Canvass    │ ──▶ │  Purchase Order  │ ──▶ │ Goods Receipt  │ ──▶ │ Quality Inspection  │
│   (pr_lines)     │     │ (+items/     │     │   (po_lines)     │     │  (grn_lines)   │     │   (quality_         │
│                  │     │  quotes)     │     │                  │     │                │     │    inspections)     │
└──────────────────┘     └──────────────┘     └──────────────────┘     └────────────────┘     └─────────────────────┘
  status: draft →          status: open →        status: pending_       on "posted": flips      references GRN
  for_canvass →            awaiting_approval      approval → approved     PO → 'received'         (no posting)
  canvassed →              → awarded → closed     → in_transit →
  converted_to_po                                 boc_clearance →
                                                  received
        │                       │                       ▲
        │ pr_id / pr_no         │ pr_id, canvass_id ────┘
        └───────────────────────┴── (FK links present in schema; PR→Canvass UI is partially manual — see §3)

  [ Supplier Invoice / AP accrual ]  — NOT in system
  [ Supplier Payment ]               — NOT in system
```

### Order-to-Cash

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Sales Order    │ ──▶ │   Delivery   │ ──▶ │  Sales Invoice   │ ──▶ │   Collection   │
│   (so_lines)     │     │ (deliveries) │     │ (sales_invoices) │     │  (collections) │
└──────────────────┘     └──────────────┘     └──────────────────┘     └────────────────┘
  status: draft →          status:               EXISTS IN SCHEMA         EXISTS IN SCHEMA
  confirmed /              scheduled →            but NO UI writer         but NO UI writer
  credit_hold →            in_transit →           (so_id FK,               (invoice_id,
  in_transit →             delivered /            invoice_amt,             customer_id,
  delivered                delayed /              vat_amt, due_date)       gross/ewt/net)
        │                  cancelled                    ▲                        ▲
        │ so_id / so_no ───────┘                        │ so_id                  │ invoice_id
        └───────────────────────────────────────────────┴────────────────────────┘
                                            (schema FKs exist; flow not yet wired in app)
```

### Supporting flows (standalone — not chained to the above)

```
 Inventory (SKU)  ──manual Adjust──▶  inventory_transactions   (only path that moves stock today)
 Milling Batch    ── paddy in → rice/bran/husk out, recovery %, total_cost (internal production)
 Toll Milling     ── customer paddy milled for a per-sack fee (service revenue, OR no.)
 Weighbridge      ── gross/tare/net weight, price, cash|credit
 Vendos           ── vendo_entries: income | expense cash movements per machine
```

---

## 3. Per-transaction reference

Each transaction below carries two distinct accounting columns, as explained in Section 1:

- **Accounting significance** = economic meaning of the transaction type (Y/N + why). Drives Section 4.
- **Posts to the books today?** = what the current code actually does to financial/inventory state.

---

### 3.1 Purchase Request — `purchase_requests` + `pr_lines`

| Attribute | Detail |
|---|---|
| Purpose | Internal request to buy goods/services; the origin of the procurement chain. |
| Trigger / when created | A department needs something; user clicks **+ New PR**. |
| Actors | Requester (`requester_id`), procurement. |
| Source document | None (start of chain). |
| Lifecycle / statuses | `draft`, `for_canvass`, `canvassed`, `approved`, `converted_to_po`, `cancelled`. UI creates as `draft` (Save Draft) or `for_canvass` (Submit). Later statuses are set elsewhere/manually. |
| Key data fields | Header: `no`, `date`, `requester_id`, `department`, `purpose`, `needed_by`, `status`, `canvass_no`, `po_no`, `total`. Lines: `line_no`, `description`, `item_id`, `uom`, `qty`, `est_unit_price`, `line_total`. |
| Downstream documents | Canvass (`canvasses.pr_id`/`pr_no`), and ultimately PO. |
| **Accounting significance** | **N** — a commitment/intent document. No goods, no liability yet. |
| **Posts to the books today?** | **No.** |

---

### 3.2 Canvass — `canvasses` + `canvass_items` + `canvass_quotes`

| Attribute | Detail |
|---|---|
| Purpose | Collect and compare supplier quotes for requested items; pick a winner per item. |
| Trigger / when created | After a PR is `for_canvass`; user clicks **+ New Canvass** (can also be free-form, no PR). |
| Actors | Procurement / buyer. |
| Source document | Purchase Request (`pr_id`, `pr_no`) — optional. |
| Lifecycle / statuses | `open`, `awaiting_approval`, `awarded`, `closed`, `cancelled`. |
| Key data fields | Header: `no`, `date`, `pr_id`, `pr_no`, `currency`, `vat_treatment` (`vat-inclusive`/`vat-exclusive`/`vat-exempt`), `status`. Items: `line_no`, `description`, `uom`, `qty`, `winner_supplier_id`. Quotes: `canvass_item_id`, `supplier_id`, `unit_price`. |
| Downstream documents | Purchase Order (`purchase_orders.canvass_id`). |
| **Accounting significance** | **N** — price discovery; no economic event. |
| **Posts to the books today?** | **No.** **Note:** the Canvass UI is a header-only screen today. An in-app banner states quote entry and winner-picking are *deferred to a follow-up release*, and that POs are issued directly. So the `canvass_items`/`canvass_quotes` tables are currently not populated by the UI. |

---

### 3.3 Purchase Order — `purchase_orders` + `po_lines`

| Attribute | Detail |
|---|---|
| Purpose | Formal commitment to a supplier to buy specified items at agreed prices. |
| Trigger / when created | Buyer issues PO (directly, per the canvass banner) via **+ New PO**. |
| Actors | Buyer (create), approver (`approve()` moves `pending_approval`→`approved`). |
| Source document | Supplier (required); optionally PR / Canvass (`pr_id`, `canvass_id` columns exist; not set by the create form today). |
| Lifecycle / statuses | `pending_approval` (default), `approved`, `in_transit`, `boc_clearance`, `overdue`, `received`, `cancelled`. UI: create → `pending_approval`; Approve → `approved`. GRN posting sets `received`. |
| Key data fields | `no`, `date`, `supplier_id`, `pr_id`, `canvass_id`, `category`, `stream` (`local`/`import`), `total`, `expected_date`, `status`, `ewt_rate`, `ewt_amount`, `bir_registered`, `notes`. Lines: `line_no`, `item_id`, `description`, `uom`, `qty`, `unit_price`, `line_total`. |
| Downstream documents | Goods Receipt (`goods_receipts.po_id`/`po_no`; `grn_lines.po_line_id`). |
| **Accounting significance** | **N** — a purchase commitment (off-balance-sheet obligation). Carries **EWT metadata** (`ewt_rate`, `ewt_amount`) computed for non-BIR suppliers, but EWT is never posted or remitted by the system. |
| **Posts to the books today?** | **No.** EWT is displayed/aggregated for a compliance KPI only. |

---

### 3.4 Goods Receipt (GRN) — `goods_receipts` + `grn_lines`

| Attribute | Detail |
|---|---|
| Purpose | Record physical receipt of goods against a PO, including received qty vs. ordered qty (variance) and a QC result. |
| Trigger / when created | Goods arrive; user picks an open PO and clicks **Post GRN**. |
| Actors | Warehouse / receiving. |
| Source document | Purchase Order (required; only POs in `approved`/`in_transit`/`boc_clearance` are selectable). |
| Lifecycle / statuses | `posted` (default), `dispute`. `qc_result`: `passed`/`partial_reject`/`rejected`. On `posted`, the app flips the PO to `received`. |
| Key data fields | `no`, `date`, `po_id`, `po_no`, `supplier_name`, `qc_result`, `warehouse_id`, `status`, `notes`. Lines: `po_line_id`, `line_no`, `description`, `uom`, `qty_po`, `qty_received`, `variance`. |
| Downstream documents | Quality Inspection (`quality_inspections.grn_id`); conceptually a supplier invoice / AP (not in system). |
| **Accounting significance** | **Y** — receipt of goods is the classic point where **inventory increases** and an **AP accrual / GR-IR liability** arises. This is the economic meaning of the document. |
| **Posts to the books today?** | **No.** The GRN code inserts header + lines and updates the PO status only. It does **not** write `inventory_transactions`, does **not** update `inventory.on_hand_mt`, and does **not** create any AP record. Quantities are captured (`qty_received`) but not valued or moved. |

---

### 3.5 Quality Inspection — `quality_inspections`

| Attribute | Detail |
|---|---|
| Purpose | Record lab/visual quality metrics for received material and a pass/reject verdict. |
| Trigger / when created | After a GRN (or free-form); user clicks **+ New Inspection**. |
| Actors | QC inspector. |
| Source document | Goods Receipt (`grn_id`, `grn_no`) — optional. |
| Lifecycle / statuses | Result: `passed`, `partial_reject`, `rejected`. No multi-step lifecycle. |
| Key data fields | `qc_no`, `grn_id`, `grn_no`, `supplier_name`, `grade`, `moisture_pct`, `impurity_pct`, `chalkiness_pct`, `broken_pct`, `inspector`, `result`, `notes`, `inspected_at`. |
| Downstream documents | None (informational; may justify a GRN dispute/rejection). |
| **Accounting significance** | **N** — a quality workflow step. (A rejection *could* drive a return/credit, but the system models no such posting.) |
| **Posts to the books today?** | **No.** |

---

### 3.6 Sales Order — `sales_orders` + `so_lines`

| Attribute | Detail |
|---|---|
| Purpose | Customer order for rice/goods; entry point of O2C. Enforces a credit check at confirmation. |
| Trigger / when created | Customer places an order; user clicks **+ New SO** (Save Draft or Confirm SO). |
| Actors | Sales. |
| Source document | Customer (required). |
| Lifecycle / statuses | `draft`, `confirmed`, `credit_hold`, `in_transit`, `delivered`, `cancelled`. UI: Save Draft → `draft`; Confirm → `confirmed`, **unless** the customer is on `credit_hold`, in which case it is forced to `credit_hold`. |
| Key data fields | `no`, `date`, `customer_id`, `stream`, `total`, `vat_amount`, `status`, `delivery_date`, `notes`. Lines: `line_no`, `item_id`, `product`, `grade`, `qty_bags`, `price_per_bag`, `amount`, `vat`. |
| Downstream documents | Delivery (`deliveries.so_id`/`so_no`); Sales Invoice (`sales_invoices.so_id` — not yet wired). |
| **Accounting significance** | **N** — a sales commitment, not yet revenue. (Note: the credit check reads `customers.credit_limit` and `customers.ar_balance`, but those balances are not maintained by any posting flow — see §5.) |
| **Posts to the books today?** | **No.** `vat_amount`/`so_lines.vat` columns exist but the create form does not compute or store VAT (inserts header `total` and line `qty_bags`/`price_per_bag` only). |

---

### 3.7 Delivery (DO) — `deliveries`

| Attribute | Detail |
|---|---|
| Purpose | Schedule and track the physical dispatch of an order to a customer. |
| Trigger / when created | A confirmed SO is ready to ship; user clicks **+ New DO** (SO link optional — manual entry allowed). |
| Actors | Logistics / dispatch. |
| Source document | Sales Order (optional; only `confirmed`/`in_transit` SOs are listed). |
| Lifecycle / statuses | `scheduled` (default), `in_transit`, `delivered`, `delayed`, `cancelled`. Advanced via a button (`scheduled`→`in_transit`→`delivered`). |
| Key data fields | `no`, `so_id`, `so_no`, `customer_name`, `truck_no`, `driver`, `destination`, `dispatch_at`, `status`, `tracking_steps` (jsonb). |
| Downstream documents | Conceptually Sales Invoice; in practice nothing is generated. |
| **Accounting significance** | **Y (conceptually)** — delivery is normally the point where **goods leave inventory and COGS is recognized** (and, under many policies, where revenue is recognized). |
| **Posts to the books today?** | **No — and cannot be, as built.** The `deliveries` table has **no line items, no quantities, and no SKU** — it is a header-only logistics record. There is no data here from which COGS or inventory-out could be derived. It does not touch `inventory` or `inventory_transactions`. **Schema gap flagged in §5.** |

---

### 3.8 Sales Invoice — `sales_invoices`  ⚠️ schema-only

| Attribute | Detail |
|---|---|
| Purpose | Bill the customer; the document that recognizes **AR + revenue + output VAT**. |
| Trigger / when created | Intended: after/with delivery. **No UI creates it today.** |
| Actors | Billing (intended). |
| Source document | Sales Order (`so_id`). |
| Lifecycle / statuses | `status` defaults to `current` (other values such as overdue/paid presumably intended; no transition code exists). |
| Key data fields | `no`, `so_id`, `invoice_amt`, `vat_amt`, `amount_due`, `invoice_date`, `due_date`, `status`. **No invoice line-item table exists** — only header amounts. |
| Downstream documents | Collection (`collections.invoice_id`). |
| **Accounting significance** | **Y** — AR (debit), Sales revenue (credit), Output VAT (credit). The single most important O2C posting event. |
| **Posts to the books today?** | **No.** Confirmed by code search: **no component reads or writes `sales_invoices`**. The table and its audit/`updated_at` triggers exist, but it is unused by the application. **Open question in §5.** |

---

### 3.9 Collection — `collections`  ⚠️ schema-only

| Attribute | Detail |
|---|---|
| Purpose | Record customer payment against an invoice (cash receipt / Official Receipt). |
| Trigger / when created | Intended: customer pays. **No UI creates it today.** |
| Actors | Cashier / collections (intended). |
| Source document | Sales Invoice (`invoice_id`) and/or Customer (`customer_id`). |
| Lifecycle / statuses | `status` defaults to `posted`. |
| Key data fields | `or_no`, `ts`, `customer_id`, `stream`, `invoice_id`, `gross`, `ewt`, `net`, `mode`, `deposited_to`, `status`, `posted_by_id`. (Captures **EWT withheld by customer** — `ewt`, and `net` = gross − ewt.) |
| Downstream documents | None (end of O2C). |
| **Accounting significance** | **Y** — Cash/Bank (debit), Creditable withholding tax receivable (debit, the `ewt`), AR (credit). |
| **Posts to the books today?** | **No.** Confirmed by code search: **no component reads or writes `collections`**. Unused by the app today. **Open question in §5.** |

---

### 3.10 Inventory — `inventory` + `inventory_transactions`

| Attribute | Detail |
|---|---|
| Purpose | Stock-on-hand master per SKU (with reserved/available and valuation) plus a movement log. |
| Trigger / when created | SKU registered via **+ New SKU**; movements logged via **Adjust**. |
| Actors | Inventory / warehouse. |
| Source document | Standalone (not auto-fed by GRN/Delivery today). |
| Lifecycle / statuses | No status field; stock state is derived (OK / Low / Critical / Out) from `on_hand_mt` vs. `reorder_pt`. |
| Key data fields | `inventory`: `sku`, `product`, `variety_grade`, `warehouse_id`, `stream`, `on_hand_mt`, `reserved_mt`, `available_mt`, `unit_cost`, `total_value`, `reorder_pt`. `inventory_transactions`: `sku`, `type` (`receipt`/`dispatch`/`adjust`), `qty`, `source_table`, `source_id`, `notes`, `ts`. |
| Downstream documents | Feeds SO availability / KPIs (read-only). |
| **Accounting significance** | **Y** — inventory is a balance-sheet asset; movements are valuation changes. `inventory_transactions` is the intended ledger of physical movements (and `source_table`/`source_id` are designed to back-reference the document that caused the move). |
| **Posts to the books today?** | **Partially — this is the only transaction that actually mutates stock state.** The manual **Adjust** flow updates `inventory.on_hand_mt` and writes an `inventory_transactions` row (best-effort, two sequential client-side writes — **not atomic**, see §5). However: `source_table`/`source_id` are left null by the Adjust flow, and **no other document (GRN, Delivery, Milling) writes here**. There is no posting to a GL — only the physical-quantity log. |

---

### 3.11 Internal Milling Batch — `milling_batches`

| Attribute | Detail |
|---|---|
| Purpose | Record an internal production run converting paddy (sacks in) into rice/bran/husk, with recovery % and cost. |
| Trigger / when created | Production schedules a batch via **+ New Batch**. |
| Actors | Milling / production. |
| Source document | Standalone (source is free-text `source`, e.g. warehouse/lot — not an FK). |
| Lifecycle / statuses | `planned` (default), `in_progress`, `completed`, `cancelled`. Advance button; `completed` stamps `date_completed`. |
| Key data fields | `batch_no`, `date_planned`, `date_completed`, `source`, `variety`, `sacks_in`, `kg_per_sack`, `rice_out`, `bran_out`, `husk_out`, `recovery_pct`, `cost_per_rice_sack`, `total_cost`, `status`, `notes`. |
| Downstream documents | Conceptually feeds finished-goods inventory; not wired. |
| **Accounting significance** | **Y (conceptually)** — production is a **WIP → finished-goods** transformation: raw paddy consumed, rice (and byproducts) produced, conversion cost capitalized. |
| **Posts to the books today?** | **No.** Records quantities/recovery/cost as data only; does not consume input inventory or create output inventory. **Note:** `total_cost` is computed with a **hardcoded "≈20 sacks per MT" approximation** (explicit code comment) — flag in §5. |

---

### 3.12 Toll Milling — `toll_milling`

| Attribute | Detail |
|---|---|
| Purpose | Record a milling **service** performed on a customer's paddy for a per-sack fee (the customer owns the grain). |
| Trigger / when created | Customer brings paddy to mill; user logs the job via **+ New Toll Job** (issues an OR number). |
| Actors | Milling / front desk. |
| Source document | Standalone (customer is free-text). |
| Lifecycle / statuses | No status field; single-event record. |
| Key data fields | `or_no`, `date`, `customer`, `variety`, `sacks_in`, `kg_per_sack`, `rice_out`, `bran_out`, `husk_out`, `recovery_pct`, `price_per_sack`, `total`, `byproduct_disposition` (`customer`/`rjl`), `notes`. |
| Downstream documents | None. |
| **Accounting significance** | **Y** — **service revenue** event (per-sack milling fee, `total`), backed by an OR number. If `byproduct_disposition = 'rjl'`, the mill also retains bran/husk (an additional inventory pickup). |
| **Posts to the books today?** | **No.** `total` is captured and aggregated into a "Toll Revenue MTD" KPI, but no revenue/cash posting and no byproduct inventory pickup occur. |

---

### 3.13 Weighbridge Ticket — `weighbridge_tickets`

| Attribute | Detail |
|---|---|
| Purpose | Weigh a vehicle (gross/tare → net), optionally priced, paid by cash or credit. |
| Trigger / when created | Vehicle is weighed; user clicks **+ New Ticket** (issues an OR number). |
| Actors | Weighbridge operator. |
| Source document | Standalone. |
| Lifecycle / statuses | No status field. `mode`: `single` / `two-way` (two-way needs a tare to complete; "pending" = two-way with no tare yet). `payment`: `cash` / `credit`. |
| Key data fields | `or_no`, `ts`, `plate`, `customer`, `mode`, `gross`, `tare`, `net`, `price`, `payment`, `operator`, `notes`. |
| Downstream documents | None. |
| **Accounting significance** | **Y (likely)** — the ticket carries a `price`, a cash/credit flag, and feeds a **"Revenue MTD"** KPI, so it behaves like a **cash (or credit) sale / weighing fee**. *This diverges from a "pure workflow" reading and is treated as significant here.* See open question in §5 on what `price` represents. |
| **Posts to the books today?** | **No.** `price` is summed into a KPI only; no cash receipt, AR (for credit), or revenue posting. |

---

### 3.14 Vendo Cash Movement — `vendo_entries` (machines: `vendos`)

| Attribute | Detail |
|---|---|
| Purpose | Log cash income and expenses for each vending machine. |
| Trigger / when created | Operator records a coin drop / refill / repair via **Log movement** under the Cash Movements tab. |
| Actors | Vendo operator. |
| Source document | Vendo machine (`vendo_id`). |
| Lifecycle / statuses | No status field. `type`: `income` / `expense`. |
| Key data fields | `vendo_entries`: `vendo_id`, `date`, `type`, `category`, `amount`, `notes`. `vendos` master: `code`, `name`, `location`, `type`, `status`. |
| Downstream documents | None. |
| **Accounting significance** | **Y** — direct **cash sales (income)** and **operating expenses** of the vending business: Cash/Bank vs. Vendo revenue or expense. |
| **Posts to the books today?** | **No.** Captured as data and for vendo KPIs; no cash/revenue/expense posting. |

---

### Master data (for reference — not transactions)

`suppliers`, `customers`, `items`, `warehouses`, `vendos` are master records. Note two balance fields that look transactional but are **not maintained by any posting flow**: `customers.ar_balance` / `customers.ytd_sales` and `suppliers.ytd_purchases` (and `customers.credit_limit`). They are read for the SO credit check and displayed, but nothing in the app increments them. See §5.

---

## 4. Accounting-significant transactions — consolidated summary

This table lists **only** the transactions with accounting significance (economic meaning). "Posts today?" repeats the implementation reality so the gap is explicit. **Beru's accounting note** is intentionally left blank for the accounting advisory to complete.

| # | Transaction | Table(s) | Economic event (why significant) | Posts to books today? | Beru's accounting note |
|---|---|---|---|---|---|
| 1 | Goods Receipt (GRN) | `goods_receipts` + `grn_lines` | Inventory in + AP accrual / GR-IR on receipt of goods | No | *(see accounting advisory)* |
| 2 | Delivery (DO) | `deliveries` | Inventory out + COGS (and possibly revenue) on dispatch — *but no line/qty data exists* | No | *(see accounting advisory)* |
| 3 | Sales Invoice | `sales_invoices` | AR + Sales revenue + Output VAT | No (schema-only, no writer) | *(see accounting advisory)* |
| 4 | Collection (OR) | `collections` | Cash/Bank + creditable withholding (EWT) − AR | No (schema-only, no writer) | *(see accounting advisory)* |
| 5 | Inventory movement | `inventory` + `inventory_transactions` | Valuation/quantity change of a balance-sheet asset | Partial — manual Adjust moves stock only (no GL) | *(see accounting advisory)* |
| 6 | Internal Milling Batch | `milling_batches` | WIP → finished goods; conversion cost capitalization | No | *(see accounting advisory)* |
| 7 | Toll Milling | `toll_milling` | Service revenue (per-sack fee) + possible byproduct inventory pickup | No | *(see accounting advisory)* |
| 8 | Weighbridge Ticket | `weighbridge_tickets` | Cash/credit sale or weighing-fee revenue | No | *(see accounting advisory)* |
| 9 | Vendo Cash Movement | `vendo_entries` | Cash sales (income) / operating expense | No | *(see accounting advisory)* |
| — | Purchase Order (EWT only) | `purchase_orders` | Not a posting itself, but holds **EWT** (`ewt_amount`) that must eventually be withheld/remitted | No | *(see accounting advisory — EWT remittance)* |

> Non-significant (workflow/commitment, excluded above): Purchase Request, Canvass, Purchase Order (the order itself), Quality Inspection, Sales Order, Delivery's logistics tracking. PO is listed once at the bottom only because of its EWT metadata.

---

## 5. Open questions & schema/implementation gaps

These are the things a product owner (and Beru) should resolve before any posting/GL layer is built on top.

**No posting engine exists.**
1. The only database triggers are `log_activity` (audit trail) and `set_updated_at`. There are **no GL/posting triggers** and no journal/ledger table. Every "Posts today? = No" above follows from this.

**Inventory is not driven by the document flow.**
2. `inventory.on_hand_mt` is changed **only** by the manual **Adjust** action. GRN (receipt) and Delivery (dispatch) do **not** write `inventory_transactions` or update stock. Milling does not consume/produce stock. *Decision needed: should GRN/Delivery/Milling drive inventory automatically?*
3. The Adjust flow does two sequential client-side writes (update `inventory`, then insert `inventory_transactions`) with **no transaction/atomicity** — a failure between them leaves stock and the movement log inconsistent (the code surfaces a partial-failure message).
4. `inventory_transactions.source_table` / `source_id` exist to back-reference the originating document but are left **null** by the only writer (Adjust). They are unused today.

**O2C is incomplete past Delivery.**
5. `sales_invoices` and `collections` exist in the schema (with audit + `updated_at` triggers) but **no component reads or writes them** (confirmed by code search). There is **no Invoice or Collection UI**, and **no invoice line-item table** (only header amounts). *Decision needed: build the SI → Collection flow; decide whether invoice needs line items.*
6. **Delivery cannot support COGS as built** — `deliveries` is header-only (no lines, qty, or SKU). To recognize COGS/inventory-out at delivery, the table needs delivered lines/quantities. *Schema change required.*
7. VAT on sales is only partially modeled: `sales_orders.vat_amount` and `so_lines.vat` columns exist but the SO create form does not compute or store VAT. `sales_invoices.vat_amt` exists but is unused. *Confirm the VAT treatment/rate rules with Beru.*

**Receivables/payables balances are not maintained.**
8. `customers.ar_balance`, `customers.ytd_sales`, `suppliers.ytd_purchases` are read (e.g., the SO credit-hold check uses `ar_balance` vs. `credit_limit`) and displayed, but **nothing in the app updates them**. As built, the credit check runs against a static/manually-set balance. *Decision needed: what maintains AR?*

**EWT (expanded withholding tax).**
9. PO computes and stores `ewt_rate`/`ewt_amount` for non-BIR suppliers and shows a "total EWT to remit" KPI, but EWT is **never posted or remitted**. Collection has its own `ewt` field (customer-side withholding) that is likewise unposted. *Confirm both EWT mechanics with Beru.*

**Milling cost assumption.**
10. `milling_batches.total_cost` is computed in code as `rice_out × 20 × cost_per_rice_sack`, where **20 ("sacks per MT") is hardcoded** (explicit code comment). This baked-in conversion should be confirmed/parameterized.

**Weighbridge semantics.**
11. Open question: does `weighbridge_tickets.price` represent a **weighing service fee**, or the **value of the goods being bought/sold** at the bridge (e.g., palay purchased by weight)? This changes whether it posts as fee revenue or as a purchase/sale. *Needs business clarification before it is given accounting treatment.*

**Document linkage that exists in schema but isn't wired in the UI.**
12. `purchase_orders.pr_id` / `canvass_id` and `canvasses.pr_id` exist, but PR → Canvass → PO is largely manual today (the Canvass screen itself says quote entry / winner-picking and the full PR→Canvass→PO automation are deferred). The chain is real in the data model but not fully automated in the app.

---

*Prepared from live schema + component code. Section 4's "Beru's accounting note" column is reserved for the accounting advisory.*
