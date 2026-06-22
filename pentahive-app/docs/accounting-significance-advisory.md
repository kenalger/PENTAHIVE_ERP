# Accounting Significance Advisory — PENTAHIVE / RJL ERP

> Prepared by: Beru (Accounting Domain Advisory)
> For: Product Owner, in response to Jinho's *ERP Transaction Documentation* (2026-06-13)
> Scope: Accounting correctness and PH/BIR compliance of the transaction layer described in `docs/erp-transaction-documentation.md`
> Grounding: All schema assertions in this advisory were verified directly against the live Supabase project `zpfkhcnxtiyojodtmepn` (tables, columns, triggers) on 2026-06-13. Standards cited: Philippine NIRC (as amended by TRAIN/RA 10963 and EOPT/RA 11976), PFRS/PAS, and BIR regulations noted inline.
> Date: 2026-06-13

---

## 1. Executive read

**What this system is, accounting-wise: a transaction-capture / operational sub-ledger layer with no general ledger underneath it.** I verified that the database has **no journal, ledger, GL, chart-of-accounts, posting, payment, supplier-invoice, or bill table** of any kind, and that **every trigger in the schema is either an `audit_*` activity-log trigger or a `*_updated_at` timestamp trigger** — there is **not one posting trigger**. This confirms Jinho's central finding: the app records documents and runs status workflows, but it produces **no double-entry, maintains no account balances, and computes no financial statements.** It is, in accounting terms, a collection of disconnected operational registers (a receiving log, a dispatch log, a milling log, a cash-movement log), not a set of books.

**What that means for the books today.** The books *do not exist inside this system.* There is no trial balance that can be struck, no balance sheet, no income statement, and no VAT or withholding-tax position that can be derived from the data as posted. The KPI figures the app shows (Revenue MTD, Toll Revenue MTD, EWT-to-remit, credit availability) are **operational tallies, not accounted figures** — they are summed from individual document rows and are not reconciled to any control account. Critically, `customers.ar_balance`, `customers.ytd_sales`, and `suppliers.ytd_purchases` are **read for live business decisions (the SO credit-hold check) but are written by nothing** — meaning the credit gate is enforced against a static, manually-seeded number that drifts from reality the moment any sale or collection occurs. That is the single most dangerous live behaviour in the system.

**Headline risks.**
1. **No GL / no double-entry** → no financial statements, no auditability of balances, BIR books of accounts (General Journal, General Ledger, subsidiary ledgers) cannot be produced from the system (RR 9-2009 / RMC on CAS).
2. **Inventory is not driven by document flow** → on-hand and valuation are maintained only by a manual, non-atomic Adjust; receipts and deliveries move no stock. Inventory asset and COGS are therefore unsupported.
3. **COGS is structurally impossible as built** → `deliveries` is header-only (verified: no line, qty, or SKU columns), so the cost of goods sold on a sale cannot be derived at all.
4. **AR/AP sub-ledgers are maintained by nothing** → the receivables figure governing credit decisions is fictional.
5. **Withholding tax is captured but never remitted** → real BIR liability (1601-EQ / 2307 obligations) sits unposted on both the purchase side (PO `ewt_amount`) and the income side (Collection `ewt`).

**One nuance that materially softens the "VAT never computed" alarm — and which the documentation should adopt:** this is a **rice-milling** business. Under **NIRC Sec 109(1)(A)**, sale of rice "in its original state, including polished and/or husked rice," and palay, is **VAT-EXEMPT**; under **Sec 109(1)(F)**, "milling for others of palay into rice" is also **VAT-EXEMPT**. So for the core rice and toll-milling lines, the *correct* output VAT is **zero**, and the unused `vat_amt` / `vat` columns on SO/SI are arguably correct-by-omission for rice — not a bug, *unless* the company also sells VATable goods (e.g., non-rice merchandise, byproducts sold commercially) or runs the **weighbridge as a VATable service**. The real VAT exposure is therefore on the **mixed-activity edges**, and the bigger VAT problem is on the **input side** (see §3 and §5): because rice sales are exempt, input VAT on rice-related purchases is **non-creditable** and must be **capitalized into inventory cost**, the opposite of a normal VATable trader.

---

## 2. Per-transaction accounting treatment

Conventions: every entry below is shown as it *should* post in a complete double-entry system, benchmarked against how QuickBooks / Xero / SAP Business One / NetSuite handle the same event. "PH/BIR" gives the local overlay. Amounts are illustrative. **None of these post today** — that is the gap, restated per §1.

---

### 2.1 Goods Receipt (GRN) — `goods_receipts` + `grn_lines`

**Correct entry (receipt of inventory against a PO):**
```
Dr  Inventory (or RM/Paddy inventory)        XXX   ← landed cost of qty_received
    Cr  Goods-Received-Not-Invoiced (GR/IR, a liability)   XXX
```
On supplier invoice (the missing AP step):
```
Dr  Goods-Received-Not-Invoiced (GR/IR)      XXX
Dr  Input VAT (only if VATable & creditable)  XXX
    Cr  Accounts Payable [supplier]                       XXX
    Cr  Withholding Tax Payable (EWT)                      XXX   ← if withholding applies
```
This is the standard two-step (receipt → bill) used by SAP B1 / NetSuite GR/IR and by QuickBooks/Xero "receive items then enter bill." **Schema-verified blocker:** `grn_lines` has **no unit_price/cost column** (only `qty_po`, `qty_received`, `variance`), so the GRN itself carries no value — the cost must be pulled from `po_lines.unit_price`. Receipt valuation cannot be done from the GRN in isolation.

**PH/BIR.** Paddy/palay purchased from farmers is a **VAT-exempt** agricultural product (Sec 109(1)(A)) — no input VAT to claim. Where input VAT *does* appear (VATable supplies bought for the rice business), it is **non-creditable** because output is exempt, and must be **capitalized into inventory cost** (Sec 110 input-VAT allocation; matching principle). **EWT:** purchases from BIR-registered suppliers of agricultural products in original state are generally exempt from EWT; for VATable suppliers, withhold **1% on goods / 2% on services** (RR 2-98 as amended), remit via **1601-EQ**, and issue **BIR Form 2307** to the supplier. The PO already stores `ewt_rate`/`ewt_amount`/`bir_registered`, so the data to do this exists — it is simply never posted or remitted.

**Supporting docs to be audit-ready:** approved PO, delivery receipt/packing list from supplier, the GRN itself, QC result, supplier's BIR-registered Sales Invoice (for goods), and Form 2307 issued where EWT was withheld.

> **Beru's note (column):** Should post *Dr Inventory / Cr GR-IR* at landed cost (qty_received × PO price); supplier bill then clears GR-IR to AP and books EWT payable (1% goods/2% svc, Form 2307). Palay is VAT-exempt; any input VAT on rice-side purchases is non-creditable and capitalized into cost. **Posts nothing today; grn_lines carries no cost.**

---

### 2.2 Delivery (DO) — `deliveries`

**Correct entry (goods leave inventory; COGS recognized):**
```
Dr  Cost of Goods Sold                XXX   ← cost of units shipped
    Cr  Inventory                              XXX
```
Under a "deliver = earn" policy, revenue is recognized here too (see SI). This is the perpetual-inventory shipment posting in every benchmark system. **Schema-verified blocker:** `deliveries` is **header-only** — no line items, no quantities, no SKU (verified columns: `no, so_id, so_no, customer_name, truck_no, driver, destination, dispatch_at, status, tracking_steps`). **COGS literally cannot be computed from this table as built.** This is a schema gap, not just a wiring gap.

**PH/BIR.** Under **EOPT (RA 11976), the Sales Invoice is the reckoning document for VAT on the sale of goods**, issued at the point of sale/delivery. For VAT-exempt rice, no output VAT arises; the DO is the operational trigger for issuing the BIR-registered Sales Invoice. A delivery receipt is a required commercial document but is **not** the VAT document.

**Supporting docs:** Sales Order, Delivery Receipt (numbered), proof of delivery (driver/customer signature), and the linked BIR Sales Invoice.

> **Beru's note (column):** Should post *Dr COGS / Cr Inventory* for units shipped (and trigger the Sales Invoice). **Cannot post as built — table is header-only with no lines/qty/SKU, so COGS is structurally underivable.** Schema change required before any COGS capability exists.

---

### 2.3 Sales Invoice — `sales_invoices` (schema-only)

**Correct entry (recognize receivable + revenue):**
```
Dr  Accounts Receivable [customer]    XXX
    Cr  Sales revenue                          XXX
    Cr  Output VAT                             XXX   ← ONLY if the item is VATable
```
The textbook O2C revenue event, identical across QuickBooks/Xero/SAP/NetSuite. **Schema-verified:** the table holds **header amounts only** (`invoice_amt`, `vat_amt`, `amount_due`) — there is **no invoice line-item table**, and **no UI reads or writes it** (consistent with no `SI` doc-series in code).

**PH/BIR — this is the load-bearing call.** For the core product (**rice in original state**), the sale is **VAT-EXEMPT** (Sec 109(1)(A)): the correct entry is **Dr AR / Cr Sales with NO output VAT**, and the invoice must be marked "VAT-EXEMPT SALE." Therefore `vat_amt = 0` is *correct* for rice — the unused VAT columns are a **latent bug only if VATable items are ever invoiced** (non-rice goods, commercially sold byproducts). The invoice must be a **BIR-registered Sales Invoice** with an approved number series (ATP or CAS/CAS-acknowledged per the EOPT invoicing rules) and must show the customer TIN for sales to VAT-registered buyers. Under EOPT the **Invoice (not the OR) is the primary document and the VAT-accrual trigger** for both goods and services.

**Supporting docs:** BIR-registered Sales Invoice (with series/ATP/CAS reference), linked SO and DO, customer TIN on file (`customers.tin` exists).

> **Beru's note (column):** The core O2C posting: *Dr AR / Cr Sales*. **Rice is VAT-EXEMPT (NIRC 109(1)(A)) → no output VAT; vat_amt = 0 is correct for rice.** Add 12% output VAT only for VATable items. Must be a BIR-registered SI series (EOPT: invoice is the VAT document). **Unused by the app today; no line-item table.**

---

### 2.4 Collection (OR) — `collections` (schema-only)

**Correct entry (cash receipt against AR, with customer-side withholding):**
```
Dr  Cash in Bank / Cash on Hand       net    ← the 'net' field
Dr  Creditable Withholding Tax (CWT) receivable   ewt   ← the 'ewt' field
    Cr  Accounts Receivable [customer]         gross  ← the 'gross' field
```
Exactly the QuickBooks/Xero "receive payment" + withholding-credit pattern. **Schema-verified:** `collections` carries `gross`, `ewt`, `net`, `mode`, `deposited_to`, and the relationship `net = gross − ewt` — so the data model is correctly shaped for this entry; it is simply **never posted (no UI reads/writes it).**

**PH/BIR.** Where the customer is a withholding agent, the `ewt` they withhold is the company's **creditable withholding tax**, supported by the **Form 2307 the customer must issue to RJL** — this is an *asset* (a prepayment of income tax), claimed against 1701Q/1702Q. Under EOPT the **Official Receipt is now a supplementary/collection document** (not the VAT-reckoning document); VAT was already reckoned at the invoice. For VAT-exempt rice there is no VAT timing issue here at all. If a collection arrives with no prior invoice (cash sale), the invoice must still be the primary document issued.

**Supporting docs:** the OR (collection receipt), the Form 2307 received from the customer (file and tie to the income-tax return), bank deposit slip matching `deposited_to`.

> **Beru's note (column):** *Dr Cash (net) + Dr CWT receivable (ewt) / Cr AR (gross)*. The `ewt` withheld by the customer is a creditable asset — must collect the customer's Form 2307 and claim it on 1701Q/1702Q. OR is a supplementary doc under EOPT. **Unused by the app today.**

---

### 2.5 Inventory movement — `inventory` + `inventory_transactions` (Adjust)

**Correct entry (only for true adjustments — write-offs, counts, spoilage):**
```
Dr  Inventory loss / shrinkage (expense)   XXX     (or Cr if a gain)
    Cr  Inventory                                   XXX
```
Routine receipts/issues should *not* be "adjustments" — they should flow from GRN (in) and Delivery (out). In every benchmark system, manual adjustments are reserved for cycle-count variances and write-offs and **always** post a GL counterpart. **Schema-verified gaps:** (a) the Adjust flow is two **non-atomic** client-side writes (update `inventory`, then insert `inventory_transactions`) — a mid-failure leaves stock and the movement log inconsistent; (b) `inventory_transactions.source_table`/`source_id` exist for document back-reference but are left **null**; (c) **`inventory` is keyed by `sku` (text) while documents key on `item_id` (uuid) / free-text `product`** — there is no shared key tying receipts/deliveries/milling to a SKU, which is a structural obstacle to ever automating perpetual inventory.

**PH/BIR.** Inventory shrinkage/write-off must be properly documented to be deductible (inventory destruction may require BIR witnessing for material write-offs). No VAT consequence on internal adjustments.

**Supporting docs:** physical count sheets, write-off approval, BIR destruction witnessing for material write-offs.

> **Beru's note (column):** Genuine adjustments should post *Dr Inventory loss / Cr Inventory* (or reverse for gains); routine in/out should come from GRN/Delivery, not Adjust. **Today: the only thing that moves stock, but non-atomic, no GL, no source link, and SKU↔item_id keys don't match — blocks perpetual costing.**

---

### 2.6 Internal Milling Batch — `milling_batches`

**Correct entries (production: consume paddy → produce rice + byproducts at cost):**
```
Issue raw material to production:
Dr  Work-in-Process                  XXX     ← paddy consumed (sacks_in × cost)
    Cr  Raw Materials (Paddy) inventory        XXX
Apply conversion cost (labor, power, milling OH):
Dr  Work-in-Process                  XXX
    Cr  Conversion cost / applied OH           XXX
Record output at cost (joint-cost allocation across rice/bran/husk):
Dr  Finished Goods — Rice             XXX
Dr  Inventory — Bran (byproduct)      XXX
Dr  Inventory — Husk (byproduct)      XXX
    Cr  Work-in-Process                        XXX
```
This is standard process-costing with joint/byproduct allocation (PAS 2). **Schema-verified gaps:** records quantities/recovery/cost as data only; consumes no input inventory and creates no output inventory. **`milling_batches.total_cost` uses a hardcoded "≈20 sacks per MT" conversion** (`rice_out × 20 × cost_per_rice_sack`) — a baked-in approximation that should be a parameter, and that distorts unit cost and therefore COGS and inventory valuation if wrong.

**PH/BIR.** Internal milling has no VAT/income event (no sale yet); it is a costing transformation. Cost accuracy matters because it feeds COGS deductibility and inventory valuation in the income-tax return.

**Supporting docs:** production order, weigh tickets in/out, recovery report, cost build-up worksheet (labor, power), and the conversion factor source.

> **Beru's note (column):** Should post *Dr WIP / Cr Raw Materials*, apply conversion cost, then *Dr Finished Goods (rice) + byproducts / Cr WIP* with joint-cost allocation (PAS 2). **Today: data only; the "20 sacks/MT" constant is hardcoded and must be parameterized — it directly biases unit cost, COGS and inventory.**

---

### 2.7 Toll Milling — `toll_milling`

**Correct entry (service revenue; the customer owns the grain):**
```
Dr  Cash / AR [customer]              total
    Cr  Toll milling service revenue           total
If byproduct_disposition = 'rjl' (mill keeps bran/husk):
Dr  Inventory — Bran/Husk             fair value
    Cr  Other income / byproduct income        fair value
```
A service-fee sale; the customer's paddy never enters RJL inventory. **Verified:** `total`, `price_per_sack`, and `byproduct_disposition` exist; only a "Toll Revenue MTD" KPI is computed — no posting, no byproduct pickup.

**PH/BIR — important exemption.** "**Milling for others of palay into rice**" is **VAT-EXEMPT under Sec 109(1)(F).** So **do not add 12% output VAT to the toll fee** for palay-to-rice milling. (Caveat per BIR guidance: independent toll *processing* that is **not** palay→rice / corn→grits / cane→raw-sugar **is** VATable at 12% — so a non-grain toll job would be VATable; classify by what is being milled.) Revenue is supported by a BIR-registered invoice; the OR documents collection. If the mill retains byproducts, their later *sale* follows the byproduct's own VAT status (bran/husk for feed is generally exempt).

**Supporting docs:** toll job order, weigh tickets, BIR-registered service invoice marked VAT-exempt (for palay→rice), OR on collection.

> **Beru's note (column):** *Dr Cash/AR / Cr Toll service revenue.* **Palay→rice milling is VAT-EXEMPT (NIRC 109(1)(F)) — no 12% VAT** (only non-grain toll processing would be VATable). If byproducts are retained ('rjl'), also *Dr Inventory / Cr Other income* at fair value. **Today: KPI only, no posting, no byproduct pickup.**

---

### 2.8 Weighbridge Ticket — `weighbridge_tickets`

**Correct entry depends on what `price` means — see the decision tree in §5.** If it is a **weighing service fee** (most likely, given the `price` + cash/credit flag + Revenue-MTD KPI):
```
Cash sale:                          Credit sale:
Dr  Cash on Hand        gross-up    Dr  AR [customer]      gross-up
    Cr  Weighing fee revenue  price     Cr  Weighing fee revenue  price
    Cr  Output VAT            12%        Cr  Output VAT            12%
```
**Verified:** `price`, `payment` (cash/credit), `customer` exist; `price` is summed into a KPI only — no cash, AR, or revenue posting.

**PH/BIR.** **Weighing is a genuine service with no agricultural exemption — it is VATable at 12% if the entity is VAT-registered.** This makes RJL a **mixed-VAT entity** (exempt rice + exempt palay milling, *but* VATable weighing and possibly VATable byproduct/merchandise sales), which triggers **input-VAT allocation** between exempt and taxable activity (Sec 110). Each ticket should generate a BIR-registered invoice/receipt.

**Supporting docs:** weighbridge ticket, BIR-registered invoice/OR, customer TIN for credit/VATable customers.

> **Beru's note (column):** If `price` is a weighing **fee**: *Dr Cash/AR / Cr Weighing revenue / Cr Output VAT 12%* — weighing is **VATable** (no exemption). If `price` is the **value of goods** weighed, it is a measurement input to a purchase/sale, not its own revenue (see §5 tree). Makes RJL a mixed-VAT entity → input-VAT must be allocated. **Today: KPI only.**

---

### 2.9 Vendo Cash Movement — `vendo_entries`

**Correct entries:**
```
Income (coin drop / sales collected):     Expense (refill stock, repair):
Dr  Cash on Hand          amount           Dr  Cost of vendo goods / Repairs & maint  amount
    Cr  Vendo sales revenue    net              Cr  Cash on Hand                            amount
    Cr  Output VAT            12% (if VATable)
```
Cash-basis retail capture, like QuickBooks "sales receipt" + "expense." **Verified:** `type` (income/expense), `category`, `amount` exist; KPI only, no posting.

**PH/BIR.** VAT status follows the **product dispensed**: bottled water / softdrinks / snacks are generally **VATable at 12%**; if a vendo dispenses an exempt agricultural product, that line is exempt. Vendo sales feed the **mixed-VAT** profile. Even cash micro-sales require BIR-registered receipting; aggregate daily Z-readings or a daily sales invoice should support the revenue. Treating gross coin-drop as revenue without separating output VAT overstates revenue and understates the VAT liability.

**Supporting docs:** machine collection sheet / coin-count report, refill purchase invoices, repair receipts; daily sales summary for BIR.

> **Beru's note (column):** Income: *Dr Cash / Cr Vendo sales (/ Cr Output VAT 12% if the product is VATable)*; expense: *Dr Expense / Cr Cash*. VAT depends on the item dispensed. **Today: KPI only, no cash/revenue/expense posting; gross coin-drop is not split from VAT.**

---

### 2.10 Commitment / non-posting documents (brief)

- **Purchase Request, Canvass, Sales Order:** commitment/intent only — **no journal entry** (no economic event yet). Correctly non-posting. *But:* the SO **credit-hold check reads `customers.ar_balance` / `credit_limit`, which nothing maintains** — so the control is enforced against a fictional balance (see §3, High). SO `vat_amount`/`so_lines.vat` exist but are unused — acceptable for exempt rice, latent for VATable lines.
- **Purchase Order:** a purchase commitment (an off-balance-sheet obligation; some entities note it as a commitment disclosure, not a posting). It **does** carry real tax metadata — `ewt_rate`, `ewt_amount`, `bir_registered` — that must eventually become a **Withholding Tax Payable** posting and **1601-EQ remittance + Form 2307 issuance**. Today this is a display KPI only; **the unremitted EWT is a real, accruing BIR liability with penalties.**
- **Quality Inspection:** workflow step, non-posting. A rejection *should* drive a return/credit memo (reversing the receipt and any AP/withholding) — not modeled.

> **Beru's note (PO/EWT):** PO is a commitment (no entry), but its `ewt_amount` becomes *Cr Withholding Tax Payable* when the bill is booked and must be **remitted via 1601-EQ with Form 2307 to the supplier** (RR 2-98). **Tracked as a KPI but never posted or remitted — a live BIR liability.**

---

## 3. Gap & risk register

| # | Finding (verified) | Severity | Standard / rule violated |
|---|---|---|---|
| G1 | **No GL / no journal / no chart of accounts / no posting trigger** (verified: only `audit_*` and `*_updated_at` triggers; no journal/ledger/GL table). No financial statements can be produced. | **Critical** | Double-entry; accrual basis (PAS 1); BIR books of accounts requirement (RR 9-2009; CAS rules) |
| G2 | **COGS cannot be computed** — `deliveries` is header-only (no line/qty/SKU). | **Critical** | Matching principle (PAS 2); revenue–cost matching |
| G3 | **Inventory asset unsupported** — GRN/Delivery/Milling move no stock; only a **non-atomic** manual Adjust does, with `source_table`/`source_id` left null. | **Critical** | Perpetual inventory; PAS 2; completeness assertion |
| G4 | **AR/AP sub-ledgers maintained by nothing** — `ar_balance`/`ytd_sales`/`ytd_purchases` read for live credit decisions but written by nothing. | **Critical** | Sub-ledger-to-control reconciliation; existence/valuation of receivables |
| G5 | **EWT captured but never remitted** — PO `ewt_amount` and Collection `ewt` are unposted; no 1601-EQ, no 2307 issuance/collection. | **Critical** | NIRC withholding rules; RR 2-98; real BIR liability + penalties |
| G6 | **SI → Collection flow unbuilt** — both tables exist but no UI reads/writes them; SI has no line-item table. | **High** | Revenue recognition (PFRS 15); BIR invoicing (EOPT/RA 11976) |
| G7 | **GRN lines carry no cost** — `grn_lines` has no unit_price; receipt valuation impossible without joining `po_lines`. | **High** | Inventory valuation (PAS 2) |
| G8 | **SKU↔document key mismatch** — `inventory.sku` (text) vs documents' `item_id` (uuid)/free-text `product`. Blocks automated perpetual costing. | **High** | Data integrity prerequisite for inventory accounting |
| G9 | **Milling cost uses hardcoded "20 sacks/MT"** — biases unit cost → COGS → inventory → taxable income. | **High** | Cost accuracy (PAS 2); income-tax deductibility |
| G10 | **Input VAT on rice-side purchases not handled as non-creditable/capitalized** — because rice output is exempt, input VAT is not a recoverable asset. | **High** | NIRC Sec 109/110; input-VAT allocation for mixed/exempt activity |
| G11 | **No mixed-VAT segregation** — weighing (VATable) + vendo (item-dependent) vs exempt rice/milling are not separated; output VAT on VATable lines never computed. | **High** | NIRC Sec 106/108/109; VAT return correctness (2550Q) |
| G12 | **No BIR-registered invoice/OR series, no ATP/CAS control, no period lock / immutability** on posted documents. | **High** | BIR invoicing & CAS rules (EOPT/RA 11976); audit-trail integrity (RR 9-2009) |
| G13 | **Weighbridge `price` semantics undefined** — fee vs goods value; drives whether it is revenue or a measurement input. | **Medium** | Revenue recognition (PFRS 15) — needs business clarification |
| G14 | **Vendo gross coin-drop treated as revenue** without VAT split (for VATable items). | **Medium** | NIRC Sec 106; revenue/VAT separation |
| G15 | **No return/credit-memo posting** on QC rejection. | **Medium** | Completeness; reversing entries for returns |

---

## 4. Recommendations / roadmap (prioritized)

**Phase 0 — Decisions to make first (no code).**
- Confirm **VAT registration status** and the **product/activity mix**: rice (exempt), palay milling (exempt), weighing (VATable), vendo (item-dependent), any merchandise/byproduct sales (case-by-case). This single decision drives every VAT entry and the input-VAT allocation method.
- Resolve **weighbridge `price`** semantics (§5).
- Decide **costing method** (weighted-average is the pragmatic default for commingled paddy/rice; FIFO acceptable) and the **milling conversion factor** (replace the hardcoded 20).

**Phase 1 — Lay the ledger (foundation; addresses G1).**
1. Add a **chart of accounts**, a **journal_entries** + **journal_lines** table (with a balanced-entry constraint Σdebit = Σcredit), and a **posting engine** (DB function / RPC) that takes a source document and writes balanced lines with `source_table`/`source_id`. Add a **period-lock** table and make posted entries immutable (reverse, never edit) to satisfy audit-trail rules.

**Phase 2 — Perpetual inventory + costing (addresses G2, G3, G7, G8, G9).**
2. Introduce a **shared item key** so `inventory`, `grn_lines`, delivery lines, SO lines, and milling all reference the same `item_id`. **Add `unit_cost` to `grn_lines`** (or post from `po_lines.unit_price`).
3. **Add delivery line items** (qty + item_id) to `deliveries` — without this, COGS is impossible.
4. Make **GRN post** `Dr Inventory / Cr GR-IR` at landed cost (rice landed cost **including non-creditable input VAT**), **Delivery post** `Dr COGS / Cr Inventory` at moving-average cost, and **Milling post** the WIP→FG transformation. Make the Adjust flow **atomic** (single RPC) and post its GL counterpart.

**Phase 3 — O2C billing + AR (addresses G4, G6).**
5. Build the **Sales Invoice** (with **line items**) and **Collection** UIs that post the §2.3/§2.4 entries; maintain `ar_balance` from invoices/collections so the **credit-hold check runs on a real balance**. Add an AR sub-ledger reconciliation to the AR control account.

**Phase 4 — Tax engine (addresses G5, G10, G11, G12, G14).**
6. **VAT:** compute output VAT only on VATable lines (weighing, VATable vendo/merchandise); mark rice/palay-milling lines exempt; implement **input-VAT allocation** capitalizing the exempt portion into inventory cost; produce **2550Q** figures.
7. **EWT:** post PO/bill `ewt_amount` to **Withholding Tax Payable**, generate **Form 2307** for suppliers, and produce **1601-EQ** remittance; on the income side, post Collection `ewt` to **CWT receivable** and capture the customer's 2307 for **1701Q/1702Q**.
8. **Invoicing control:** implement **BIR-registered SI/OR number series** with ATP/CAS controls per EOPT (RA 11976); SI is the VAT document, OR is supplementary.

**Phase 5 — AP + close.**
9. Build **Supplier Invoice (bill)** and **Payment** to clear GR-IR → AP → Cash, maintain `ytd_purchases`, and enable a real period close and financial statements (Trial Balance, Balance Sheet, Income Statement).

---

## 5. Weighbridge price — accounting decision tree

The treatment of `weighbridge_tickets.price` hinges on **what the weighing event economically is.** Resolve with the business before assigning an entry:

```
Is the weighbridge being paid a fee to weigh someone else's vehicle/cargo?
│
├─ YES → it is a WEIGHING SERVICE.
│        • Revenue event of its own.
│        • Entry: Dr Cash (cash) or Dr AR (credit)  /  Cr Weighing fee revenue  /  Cr Output VAT 12%
│        • VATable: weighing has NO agricultural exemption (Sec 108) → 12% if VAT-registered.
│        • May make RJL a withholding-tax PAYEE: if the customer is a withholding agent,
│          they withhold 1%/2% and must issue RJL a Form 2307 (book Dr CWT receivable).
│        • Requires a BIR-registered service invoice / OR per ticket.
│
└─ NO → the weight is being used to PRICE A PURCHASE OR SALE OF GRAIN
         (e.g., palay bought/sold "by the kilo" at the bridge).
         • `price` is then the VALUE OF THE GOODS, not fee revenue.
         • It is a MEASUREMENT INPUT to a purchase (Dr Inventory/Paddy) or a sale
           (Dr AR/Cash / Cr Sales) — NOT its own revenue line. Do NOT double-count it as weighing revenue.
         • VAT follows the GOODS: palay/rice in original state = EXEMPT (Sec 109(1)(A)); no output VAT.
         • The ticket becomes a supporting weigh document behind a GRN (purchase) or SI (sale),
           and should link to that document — not post independently.
```

**Recommended default until clarified:** treat the weighbridge as a **VATable weighing service** (the `price` + cash/credit flag + Revenue-MTD KPI strongly suggest a fee, not a grain valuation), but **flag every ticket that lacks a linked GRN/SI** for review, since an unlinked priced ticket is the signature of the second branch (grain valuation) being mis-captured as standalone revenue.

---

## Verdict

The system is a competent operational capture layer but is **not a set of books**: with no GL, no COGS capability, no maintained sub-ledgers, and uncomputed/unremitted VAT and withholding tax, it cannot today produce BIR-compliant financial statements or tax returns. The accounting does **not** hold up yet — but the data model is close enough that a posting engine, perpetual inventory tied to a shared item key, delivery line items, and a PH-aware tax engine (rice/milling exempt, weighing/vendo VATable, EWT remitted) would make it compliant. Get the **rice VAT-exemption** and **non-creditable input-VAT capitalization** right from day one; building a standard VATable-trader posting model here would be a costly and incorrect mistake.

---

### Sources
- NIRC Section 109 – VAT Exempt Transactions
- Value Added Tax Exemptions in the Philippines – Tax and Accounting Center, Inc.
- BIR RR 2-98 (Expanded Withholding Tax); RR 9-2009 / CAS rules (books of accounts & audit trail); EOPT / RA 11976 (invoicing).

*Cross-reference: see `docs/erp-transaction-documentation.md` (Jinho) for the per-transaction process detail this advisory annotates.*
