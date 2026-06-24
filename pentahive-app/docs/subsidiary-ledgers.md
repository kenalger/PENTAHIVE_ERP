# Subsidiary Ledgers in the RJL ERP

_Audience: product owner (non-accountant) + engineering team._
_Status: as-built description and gap analysis. Last reviewed 2026-06-15._

---

## 1. TL;DR / Executive Summary

The RJL ERP **posts correctly at the control-account level** (the General Ledger is balanced and the high-level totals for AR, AP, Cash, and Advances are right). What it does **not** have is a real **subsidiary-ledger layer**: the GL records every entry only against an account (e.g. "Accounts Receivable – Trade"), with **no per-party dimension** (no customer, supplier, bank, or employee attached to the journal line). As a result the GL **cannot, by itself, produce a per-customer or per-supplier breakdown**.

Per-party detail does exist, but it is **reconstructed from the source documents** (invoices, collections, supplier bills, payments) and from running balances kept alongside the GL — not from the GL itself. The `subsidiary` tag on the chart of accounts that looks like it should drive this is currently **decorative**: it is read only by the Chart of Accounts screen for display and editing, and is consumed by **no** posting routine, view, or report.

The strongest area is **AP (per-supplier)**, which is genuinely usable. The weakest are **per-customer AR** (three different numbers for the same thing, plus a known reporting bug), **per-bank cash** (only one bank account exists), and **employee advances** (the account is tagged, but no module or table backs it).

---

## 2. What a Subsidiary Ledger Is (plain English)

A **control account** holds a single lump balance in the General Ledger. For example:

> Accounts Receivable – Trade = ₱500,000

A **subsidiary ledger** is the detailed breakdown of that same balance, party by party:

> Customer A ₱200,000 · Customer B ₱180,000 · Customer C ₱120,000 → **₱500,000**

The defining rule is:

> **Control account balance = the sum of its subsidiary ledger.**

If they don't tie out, something is wrong. This rule applies to several account types:

| Control account | Subsidiary ledger is "per…" |
| --- | --- |
| Accounts Receivable – Trade | customer |
| Accounts Payable – Trade | supplier |
| Cash in Bank | bank account |
| Advances to Employees | employee |

### Why it matters

- **Operations** — You need to know _who_ owes you (and who you owe), and how old each balance is (aging), to collect, pay, and plan cash. A single lump AR number can't answer "who is overdue?"
- **BIR compliance (Philippines)** — Several mandatory submissions are **per-party with TINs**:
  - **SLSP** (Summary List of Sales and Purchases)
  - **BIR Form 2307 / CWT** (creditable withholding tax certificates), which are issued per payee/payer.
  - BIR's prescribed books of account require **subsidiary ledgers that reconcile to the GL**.
- **Audit** — Auditors perform a **control-to-subledger tie-out**: they confirm the detailed party balances add up exactly to the control account. If you can't produce that, the books are harder to defend.

---

## 3. How RJL Handles Each Subsidiary Type Today

The four control accounts that are _tagged_ as having subsidiaries (verified in `acc_titles`):

| Account | `acc_titles.id` | `subsidiary` tag | Reality today |
| --- | --- | --- | --- |
| Accounts Receivable – Trade | 9 | `[CUSTOMER]` | **Partial** — detail derived from source docs; known divergence + bug |
| Accounts Payable – Trade | 22 | `[SUPPLIER]` | **Works** — real per-supplier subledger with allocations |
| Cash in Bank | 11 | `[BANK]` | **Missing** — only one cash-in-bank account exists |
| Advances to Employees | 7 | `[EMPLOYEE]` | **Missing** — no module or table behind it |

### 3.1 Customer (AR) — _Partial_

- **Where the detail lives:**
  - Running balance per customer: `customers.ar_balance` (and `customers.ytd_sales`), bumped by the sales-invoice and collection bridges.
  - Source documents: `sales_invoices`, `collections`.
  - Surfaced by the view `v_customer_ar`, which derives AR from invoice `status` + `amount_due`.
- **How it ties to the control account:** Indirectly and **implicitly**. Each posting also updates `customers.ar_balance` alongside the GL, so the running balance is kept in step by hand — there is no query that proves the customer balances sum to GL account 9.
- **Important structural detail:** `sales_invoices` has **no direct `customer_id`**; the customer is resolved through the chain `sales_invoices.so_id → sales_orders.customer_id` (confirmed: `sales_invoices` exposes `so_id`, `amount_due`, `status` only). By contrast, the `collections` row **does** carry a direct `customer_id` (and `invoice_id`). This split matters — see the bug in §5.2.

### 3.2 Supplier (AP) — _Works (adequate today)_

This is the **strongest** subsidiary ledger in the system and is genuinely usable.

- **Where the detail lives:**
  - `supplier_invoices` — one row per bill, with `net_payable`.
  - `supplier_payment_allocations` — per-bill amounts applied by each payment.
  - `v_apv_remaining` — per-bill remaining balance with open / partial / paid state.
  - Running balance per supplier: `suppliers.ap_balance`.
- **How it ties:** Per-bill allocations roll up to per-supplier totals, and the bill status is recomputed from actual remaining balance (not gated on a full-payment condition — see contrast in §5.2). This feeds the **BIR purchase / EWT reports**.

### 3.3 Bank (Cash) — _Missing_

- There is exactly **one** "Cash in Bank" account title (`acc_titles.id 11`). There are **no per-bank sub-accounts**, so there is **no per-bank subledger**. The `[BANK]` tag points at a breakdown that does not exist. (Confirmed: no bank/account tables backing this.)

### 3.4 Employee (Advances) — _Missing_

- The account "Advances to Employees" (`id 7`) exists and is tagged `[EMPLOYEE]`, but there is **no employee-advance module, table, or subledger** anywhere in the system (confirmed: no employee/advance tables exist). The tag declares an intention that nothing fulfills.

---

## 4. The `subsidiary` Tag, Explained

- **What it is:** a `text[]` column on `acc_titles` (`subsidiary`) holding values from the set `CUSTOMER` / `SUPPLIER` / `BANK` / `EMPLOYEE`. It is currently set on exactly the four accounts listed above (ids 7, 9, 11, 22).
- **What it does today:** It is a **UI marker only.** It is read solely by the Chart of Accounts screen — see `src/app/chart-of-accounts/chart-of-accounts.ts` — where it drives:
  - display chips on each account,
  - the edit toggles when creating/editing a title (`toggleSubsidiary`),
  - inclusion in the title search filter.
- **What it does NOT do:** No database migration, view, posting function, or report consumes it. It **drives no posting and no reporting, and nothing enforces it.** An account can be tagged `[CUSTOMER]` and still receive journal lines with no party attached — because journal lines have no party field at all (see §5.1).
- **What it was meant to enable:** the intent is clearly "this account is a control account whose detail is tracked per party of this type." That intent is sound; it is simply not yet wired to anything. P1 (§6) is what makes the tag functional.

---

## 5. Gaps & Risks

### 5.1 The GL has no party dimension (root limitation)

`journal_lines` is, verified, exactly:

```
entry_id, account_id, debit, credit, memo, line_no
```

There is **no `customer_id`, `supplier_id`, or `subsidiary_id`.** Therefore:

- The GL **cannot emit a true subledger** for any tagged account.
- `v_account_ledger` shows every line hitting AR, but **not which customer** each line belongs to.
- Control-to-subledger reconciliation is **implicit** (running balances maintained alongside posting), not a **provable GL tie-out**.

### 5.2 Three unreconciled representations of AR (and the same for AP)

For AR there are **three different numbers** for the same balance, with **nothing in the system reconciling them**:

1. **Stored** — `customers.ar_balance`
2. **Derived** — `v_customer_ar` (from invoice `status` + `amount_due`)
3. **GL** — account `9`

The same triad exists for AP: `suppliers.ap_balance` / `v_apv_remaining` / GL account `22`. No query reconciles either set.

#### Known bug — partial collection overstates `v_customer_ar`

> **This is a reporting / divergence bug, NOT a posting bug. The GL stays correct and `customers.ar_balance` stays correct. Only `v_customer_ar` is wrong.**

In `fn_bridge_collection`, the invoice is flipped to `paid` only on a **full** collection, via:

```
UPDATE sales_invoices
   SET status = 'paid', updated_at = now()
 WHERE id = NEW.invoice_id
   AND v_gross >= amount_due;   -- only fires on full payment
```

When a collection is **partial** (`v_gross < amount_due`):

- The GL posts a correct `v_gross` credit to AR — **control account is right.**
- `customers.ar_balance` is decremented by `v_gross` via the collection's **direct `customer_id`** — **stored balance is right.**
- But the `WHERE v_gross >= amount_due` clause **does not fire**, so the invoice status never moves. There is **no `partial` state today** — the invoice simply stays in its prior (unpaid/open) status.
- `v_customer_ar` then keeps counting the **full `amount_due`** for that invoice → **`v_customer_ar` overstates AR.**

The shape of the bug is explained by the two different keys noted in §3.1: `ar_balance` is updated via the collection's direct `customer_id` (unconditional, correct), while the invoice status is updated on a separate, **conditional** path keyed by `invoice_id`. Two update paths, one of them gated — they diverge on partial payments.

AP **avoids** this: `rpc_post_cv` rewrites each bill's status from `v_apv_remaining`'s actual remaining balance, so a partial payment correctly lands the bill in a partial state rather than being skipped.

### 5.3 Structural fragility

- **AR-per-customer** depends on the `sales_invoices.so_id → sales_orders.customer_id` chain (no direct `customer_id` on the invoice).
- **Bank** = a single account, no per-bank breakdown.
- **Employee advances** = a tag with no module behind it.

### 5.4 Honest adequacy assessment

- **Adequate now:** AP per-supplier (with allocations).
- **Not adequate:** per-customer AR (divergence + indirect link + the partial-collection bug), per-bank cash, employee advances, and **any claim that GL subledgers reconcile to control accounts** (they don't — reconciliation is implicit, not provable from the GL).

---

## 6. Recommendations / Roadmap

> Engineering note: the items below describe the **target shape and what it unlocks** (the "what"). Concrete schema/trigger implementation is for the engineering owner (Bellion) to design.

### P1 — Add a subsidiary dimension to the GL (the real fix)

- Add `subsidiary_type` + `subsidiary_id` to `journal_lines`.
- Populate them on **control-account lines** from the bridges and `rpc_post_cv`.
- Enforce with a CHECK/trigger: **journal lines on a subsidiary-tagged account MUST carry a `subsidiary_id`.**
- **Unlocks:** the GL emits a **true subledger** that **provably reconciles** — `GROUP BY subsidiary_id` on a control account must equal the control total. This is the QuickBooks / Xero / NetSuite model. It also makes the `subsidiary` tag **functional** (the tag becomes the rule the trigger enforces).

### P2 — Interim safeguards (do these even before P1 lands)

- Add a `v_subledger_reconciliation` view: per party, show **stored balance vs derived vs GL total**, and **flag mismatches**. This surfaces the three-way divergence instead of hiding it.
- **Fix the partial-collection bug:** transition invoices to a `partial` state on partial collection, mirroring the AP `derived_status` pattern (recompute status from remaining balance rather than gating on full payment).

### P3 — Structural completeness

- Per-bank **Cash in Bank** sub-accounts (so the `[BANK]` tag means something).
- An **employee-advance subledger** module/table — **or** drop the `[EMPLOYEE]` tag until one exists.
- Add a **direct `customer_id`** to `sales_invoices` (remove the `so_id` indirection).
- **AR/AP aging by party.**

---

## 7. Glossary & Pointers

### Glossary

- **Control account** — a single GL account that holds a lump total whose detail is tracked elsewhere (e.g. AR-Trade).
- **Subsidiary ledger (subledger)** — the per-party breakdown of a control account; must sum to the control balance.
- **SLSP** — BIR Summary List of Sales and Purchases; a per-party (per-TIN) submission.
- **CWT / Form 2307** — creditable withholding tax; certificates issued per payee/payer.
- **Aging** — grouping a party's open balance by how overdue it is (e.g. current / 1–30 / 31–60 / 60+ days).
- **Tie-out** — proving the subledger sums exactly to the control account.

### Code & DB pointers

| Object | Role |
| --- | --- |
| `acc_titles.subsidiary` (text[]) | the tag; values CUSTOMER/SUPPLIER/BANK/EMPLOYEE on ids 7, 9, 11, 22 |
| `src/app/chart-of-accounts/chart-of-accounts.ts` | the only consumer of the tag today (display/edit/search) |
| `journal_lines` | GL lines — `entry_id, account_id, debit, credit, memo, line_no` (no party dimension) |
| `v_account_ledger` | per-account ledger (no party breakdown) |
| `fn_bridge_collection` | posts collections; **site of the partial-collection bug** (`v_gross >= amount_due`) |
| `fn_bridge_sales_invoice` | posts sales invoices; bumps `customers.ar_balance` |
| `customers.ar_balance`, `v_customer_ar`, GL acct 9 | the three unreconciled AR representations |
| `supplier_invoices`, `supplier_payment_allocations`, `v_apv_remaining`, `suppliers.ap_balance` | the working AP subledger |
| `rpc_post_cv` | posts cash vouchers; rewrites bill status from `v_apv_remaining` (the pattern AR should copy) |
