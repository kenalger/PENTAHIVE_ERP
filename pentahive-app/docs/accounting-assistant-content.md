# Accounting Assistant — Built-in Help Content (JKL ERP)

> Authored by Beru (Accounting Domain Advisory) · 2026-06-13. All accounting facts anchored to the JKL Accounting Significance Advisory. Account names below are the exact seeded titles in the live Chart of Accounts. This file is the SOURCE for the in-app Accounting Assistant page — render PART 1/2 as guided content, PART 3 as a searchable Q&A index, PART 4 as cheat-sheet cards.

---

## PART 1 — START HERE: Set up your Chart of Accounts (dumbproof walkthrough)

### What is a Chart of Accounts, in one breath?
A Chart of Accounts (COA) is just the **master list of "buckets" your money can sit in or flow through** — Cash, Sales, Inventory, Expenses, and so on. Every transaction in the system eventually drops amounts into one or more of these buckets. You do not need to be an accountant to use it. Most of the work is already done for you.

### Before you touch anything — 3 things to know
1. **Your chart is already built for you (pre-seeded).** We loaded a complete, Philippine rice-mill-ready chart: 3 Groups, 7 Classes, 12 Subclasses, and 44 ready-to-use Accounts. Your first job is **reviewing and tidying**, not building from zero.
2. **It is a 4-level tree, biggest to smallest:** **Group → Class → Subclass → Account (Title).** Click the arrow on any row to expand it and see what lives underneath. Think of it like folders (Groups/Classes) holding files (Accounts).
3. **You almost never delete in accounting.** If an account is wrong or unused, you **deactivate** it (hide it), never hard-delete it. This keeps your history honest.

### How to read the tree (the 4 levels)
1. **Group** = the broadest bucket. There are only 3: **REAL** (things you keep — cash, what you own, what you owe), **NOMINAL** (things that reset each year — sales and expenses), and **FINANCIAL** (a presentation layer that rolls the others up into reports).
2. **Class** sits inside a Group — e.g. *Current Assets*, *Revenue*, *Operating Expenses*.
3. **Subclass** sits inside a Class — e.g. *Cash and Cash Equivalents*, *Inventories*, *Tax Liabilities*. The Subclass is where the **Debit/Credit side**, the **cash-flow category**, and the numbering **prefix** are set.
4. **Account (Title)** is the actual bucket you post to — e.g. *Cash on Hand*, *Sales – Rice (VAT-exempt)*, *Accounts Payable – Trade*. This is the only level a transaction touches.

### Step-by-step: get your COA ready

**Step 1 — Open the Chart of Accounts page and expand a Group.** Click the arrow beside **Real Accounts** to drill down through Class → Subclass → Account. Spend two minutes just looking — you will recognise most buckets (Cash, Sales, Utilities).

**Step 2 — Review, don't rebuild.** Because the chart is pre-seeded, read down the list and ask only: "Is anything we actually use missing?" and "Is anything here we will never use?" Most users change nothing.

**Step 3 — Use search to jump to an account.** Type a word (e.g. "rice", "VAT", "cash") in the search box. The tree expands straight to the matches so you don't have to hunt.

**Step 4 — If you need a NEW account, add it at the right level.** Use the **＋ Add** button on the level you want. The form's fields change depending on the level:

- **Add a Group** (rare — you have all 3 already): enter **Name**, pick **Type** (REAL / NOMINAL / FINANCIAL), and a **Type sequence** (the order it shows in reports). *You will almost never do this.*
- **Add a Class**: enter **Name** and pick its **Parent Group**. Example: a "Other Income" class under NOMINAL.
- **Add a Subclass**: enter **Name**, pick **Parent Class**, choose the **Side (DEBIT or CREDIT)** — see Step 6 — pick a **Cash-flow category** (NONE / OPERATING / INVESTING / FINANCING; pick **OPERATING** if unsure, since day-to-day trading is operating), and set a **Prefix** (the leading digits of the account number).
- **Add a Title (the actual account)** — *this is the one you'll use most*: enter **Name**, pick **Parent Subclass**, choose the **Side (DEBIT or CREDIT)**, add **Subsidiary tags** only if this account is tracked per party (**CUSTOMER** for receivables, **SUPPLIER** for payables, **BANK** for a bank account, **EMPLOYEE** for staff advances; leave blank otherwise). The **account code is generated for you** — don't type it.

**Step 5 — Pick the Side correctly (this is the only "accounting" decision).** See Step 6 for what it means. Quick rule: things you **own or spend** are **DEBIT**; things you **owe, your sales, or owner's money** are **CREDIT**.

**Step 6 — Understand DEBIT vs CREDIT "normal balance" in plain terms.** Every account has a "home side" where its balance normally sits:
- **DEBIT-normal** = Assets (Cash, Inventory, Receivables) and Expenses. These **go UP with a debit**.
- **CREDIT-normal** = Liabilities (Payables, taxes you owe), Equity (owner's money), and Income/Sales. These **go UP with a credit**.
- That's it. "Debit" and "credit" are just *left* and *right* — not good or bad. A debit to Cash means more cash; a credit to Sales means more sales.

**Step 7 — To retire an account, DEACTIVATE it (never delete).** Use the **Deactivate** action on the node. It disappears from everyday dropdowns but stays in history. Flip the **"Show inactive"** toggle if you ever need to see or reactivate it.

**Step 8 — To fix a name or setting, use Edit per node.** Change a label or correct a side via the pencil/edit on that row. Avoid changing the side of an account that has already been used — add a new one instead and deactivate the old.

### You're done when…
- [ ] You've expanded all 3 Groups at least once and the structure makes sense.
- [ ] Your main money buckets exist: **Cash on Hand**, **Cash in Bank**, **Accounts Receivable – Trade**, **Accounts Payable – Trade**, your **Sales** accounts, **Inventory** accounts, and your usual **expenses**. (All pre-seeded — just confirm.)
- [ ] Anything you'll never use is **deactivated**, not deleted.
- [ ] Any account you added has the **right Side** and the **right Parent Subclass**.
- [ ] You did **not** invent account codes by hand (the system did that).

Relax — if the chart is pre-seeded and you changed nothing, **you are already done.**

---

## PART 2 — Plain-English Glossary

| Term | Plain meaning |
|---|---|
| **Chart of Accounts (COA)** | The master list of every "bucket" money can sit in or pass through. The backbone of your books. |
| **Account / Title** | One specific bucket you actually post to (e.g. *Cash on Hand*). The lowest level of the tree. |
| **Group** | The top level — only 3 exist. **REAL** = permanent things you keep (carry over every year — the balance sheet). **NOMINAL** = temporary things (sales & expenses that reset to zero each year — the income statement). **FINANCIAL** = a presentation layer that rolls the others up into the formal reports. |
| **Class** | A folder inside a Group (e.g. *Current Assets*, *Revenue*, *Operating Expenses*). |
| **Subclass** | A smaller folder inside a Class (e.g. *Inventories*, *Tax Liabilities*). Holds the Side, cash-flow category, and number prefix. |
| **Debit** | The **left** side of an entry. Increases assets and expenses; decreases liabilities, equity, income. Not "bad." |
| **Credit** | The **right** side of an entry. Increases liabilities, equity, and income; decreases assets and expenses. Not "good." |
| **Normal balance** | The side an account *usually* sits on. Assets/Expenses = Debit-normal. Liabilities/Equity/Income = Credit-normal. |
| **Contra account** | An account that works *backwards* against its neighbour. E.g. *Accumulated Depreciation* (credit) reduces equipment; *Allowance for Doubtful Accounts* (credit) reduces receivables. |
| **Cash-flow category** | A tag (OPERATING / INVESTING / FINANCING / NONE) telling the Cash Flow report which section a movement belongs to. Day-to-day trading = OPERATING. |
| **Subsidiary ledger** | A breakdown of one account by party — e.g. *Accounts Receivable* split per **customer**. The tags CUSTOMER/SUPPLIER/BANK/EMPLOYEE turn this on. |
| **Assets** | What the business owns or is owed (cash, inventory, receivables, equipment). Debit-normal. |
| **Liabilities** | What the business owes (suppliers, taxes payable, loans). Credit-normal. |
| **Equity** | The owner's stake — capital put in, plus profits kept, minus drawings. Credit-normal. |
| **Revenue / Income** | Money earned from selling goods or services. Credit-normal. |
| **Expense** | The cost of running the business (salaries, power, fuel). Debit-normal. |
| **COGS (Cost of Goods Sold)** | The cost of the actual goods you sold — what the rice *cost you*, recorded when it's sold. |
| **WIP (Work-in-Process)** | Goods mid-production — paddy that's being milled but isn't finished rice yet. An asset bucket. |
| **AR (Accounts Receivable)** | Money customers owe you for sales made on credit. An asset. |
| **AP (Accounts Payable)** | Money you owe suppliers for goods/services received. A liability. |
| **GR/IR (Goods Received Not Invoiced)** | A temporary "we got the goods but the supplier bill hasn't arrived yet" holding account. Clears when the bill comes. |
| **Input VAT** | The 12% VAT *you pay* on purchases. Normally claimable — **but not for a rice mill** (see VAT Q&A). |
| **Output VAT** | The 12% VAT *you charge* customers on VATable sales. You owe this to the BIR. |
| **VAT-exempt** | A sale with **no VAT at all** — not 0%, just outside VAT. Rice and palay-milling are VAT-exempt. |
| **EWT (Expanded Withholding Tax)** | A small slice of a payment (1% on goods, 2% on services) the *payer* holds back and remits to the BIR on the payee's behalf. |
| **Form 2307** | The BIR certificate proving EWT was withheld. The withholder gives it to the payee; the payee uses it as a tax credit. |
| **CWT (Creditable Withholding Tax) Receivable** | When a *customer* withholds tax from paying you, that withheld amount is an asset — a prepaid income tax you can credit later. |
| **VAT-registered vs Non-VAT** | Whether your business charges/claims 12% VAT (2550Q) or instead pays 3% percentage tax (2551Q). Affects which forms you file. |
| **1601-EQ** | The quarterly BIR return for remitting EWT you withheld. |
| **2550Q** | The quarterly VAT return. |
| **Posting / Journal entry** | Turning a real-world event into balanced Debit/Credit lines in the books. The system now does this automatically across the board — **buying** (supplier bill, payment), **selling** (sales invoice, collection), milling, toll milling, weighbridge, and vendo. View every entry in **Accounting → General Ledger**. (One thing still deferred: the **cost of rice sold (COGS)** isn't booked at the point of sale yet — see the "Is this normal?" Q&A.) |

---

## PART 3 — The Big Q&A (the "Assistant")

> Render each as a searchable card: `{ category, question, answer, related_accounts }`.

### Category: Getting Started / COA

- **Q: Do I need to make all the accounts from scratch?**
  A: No. Your Chart of Accounts is pre-seeded with a full rice-mill setup — 3 Groups, 7 Classes, 12 Subclasses, and 44 ready accounts. Your job is to review it and tidy, not build it. Most people change nothing.
  related: []

- **Q: What is a debit and what is a credit, simply?**
  A: They're just the left side (debit) and right side (credit) of an entry — not good or bad. Things you own or spend (Cash, Inventory, Expenses) go UP with a debit. Things you owe, your sales, and owner's money go UP with a credit. Every entry has equal debits and credits, so the books always balance.
  related: []

- **Q: I sell rice — which account do I use?**
  A: Use "Sales – Rice (VAT-exempt)" for the rice income, and "Accounts Receivable – Trade" if the customer is buying on credit, or "Cash on Hand"/"Cash in Bank" if they pay now. Rice in its original state carries NO VAT.
  related: ["Sales – Rice (VAT-exempt)", "Accounts Receivable – Trade", "Cash on Hand", "Cash in Bank"]

- **Q: What does the FINANCIAL group mean? It's not money I touch.**
  A: Correct — you never post to it. REAL and NOMINAL are where real transactions land. FINANCIAL is a presentation layer that rolls those up so your Balance Sheet, Income Statement, and Cash Flow reports come out formatted correctly. Leave it alone.
  related: []

- **Q: What's the difference between REAL and NOMINAL accounts?**
  A: REAL accounts are permanent — cash, inventory, payables, owner's equity — they carry their balance into next year (the Balance Sheet). NOMINAL accounts — sales, cost of sales, expenses — are temporary; they reset to zero at year-end after their profit rolls into Retained Earnings (the Income Statement).
  related: ["Retained Earnings"]

- **Q: How do I add a new expense account?**
  A: Expand NOMINAL → Operating Expenses → its subclass, then click "＋ Add" at the Title level. Enter the name, pick the parent subclass, set Side = DEBIT (expenses are debit-normal), leave subsidiary tags blank, and let the code auto-generate.
  related: ["Miscellaneous Expense"]

- **Q: I made an account by mistake — how do I delete it?**
  A: You don't delete it — you deactivate it. Use the Deactivate action on that row. It hides from dropdowns but stays in history so your records remain trustworthy. Use the "Show inactive" toggle to find it again later.
  related: []

- **Q: What are the subsidiary tags (CUSTOMER, SUPPLIER, BANK, EMPLOYEE) for?**
  A: They tell the system to track that account broken down by party. Tag Accounts Receivable with CUSTOMER so you can see who owes you; tag Accounts Payable with SUPPLIER to see who you owe; tag a bank account BANK; tag staff-advance accounts EMPLOYEE. Leave blank for accounts not tracked per party.
  related: ["Accounts Receivable – Trade", "Accounts Payable – Trade", "Cash in Bank", "Advances to Employees"]

- **Q: What is "normal balance"?**
  A: It's the side an account usually sits on. Assets and Expenses are Debit-normal (they grow with debits). Liabilities, Equity, and Income are Credit-normal (they grow with credits). When you add an account, this is the "Side" you choose.
  related: []

- **Q: What is a contra account? I see "Accumulated Depreciation" under assets but it's a credit.**
  A: A contra account works backwards against its neighbour. Accumulated Depreciation (credit) reduces the value of your equipment; Allowance for Doubtful Accounts (credit) reduces receivables you may not collect. They live next to what they offset, but carry the opposite side.
  related: ["Accumulated Depreciation", "Allowance for Doubtful Accounts"]

### Category: Sales & Collections

- **Q: What's the difference between a Sales Invoice and an Official Receipt?**
  A: Under the BIR's EOPT rules, the Sales Invoice is now the MAIN document — it's what records the sale and (for VATable items) the VAT. The Official Receipt is just a supplementary proof that you collected the cash afterward. For rice (VAT-exempt) the invoice simply shows no VAT.
  related: ["Sales – Rice (VAT-exempt)", "Accounts Receivable – Trade"]

- **Q: When is revenue actually recorded — when I deliver, or when I get paid?**
  A: Revenue is recorded when you bill the sale (the invoice), not when cash arrives. Selling on credit: you record the sale and an Accounts Receivable now; the later payment just swaps that receivable for cash. Getting paid is not a second sale.
  related: ["Sales – Rice (VAT-exempt)", "Accounts Receivable – Trade", "Cash in Bank"]

- **Q: A customer bought rice on credit — what hits which account?**
  A: Debit "Accounts Receivable – Trade" (they owe you) and credit "Sales – Rice (VAT-exempt)" for the amount. No VAT on rice. The cost side (COGS) — what the rice cost you — will be matched separately when costing is switched on; for now an invoice books the revenue and the receivable, but not yet the cost of the rice leaving inventory.
  related: ["Accounts Receivable – Trade", "Sales – Rice (VAT-exempt)", "Cost of Goods Sold", "Inventory – Finished Goods (Rice)"]

- **Q: The customer paid me. Where does the money go?**
  A: Debit your cash account ("Cash on Hand" or "Cash in Bank", or "Undeposited Funds" if not yet banked) and credit "Accounts Receivable – Trade" to clear what they owed. If they withheld tax, see the withholding-tax Q&A.
  related: ["Cash in Bank", "Undeposited Funds (Collections in Transit)", "Accounts Receivable – Trade", "Creditable Withholding Tax (CWT) Receivable"]

- **Q: What is "Undeposited Funds"?**
  A: A holding account for money you've collected but not yet brought to the bank. You debit it when you receive payment, then move it to "Cash in Bank" on the day you actually deposit. It keeps your book cash matching your bank.
  related: ["Undeposited Funds (Collections in Transit)", "Cash in Bank"]

### Category: Purchases & Milling

- **Q: I received goods from a supplier but no bill yet — what happens?**
  A: You record the goods into inventory now and park the amount owed in "Goods Received Not Invoiced (GR/IR)", a temporary liability. Debit the relevant Inventory account, credit GR/IR. When the supplier's bill arrives, GR/IR clears into "Accounts Payable – Trade".
  related: ["Inventory – Paddy / Raw Materials", "Goods Received Not Invoiced (GR/IR)", "Accounts Payable – Trade"]

- **Q: What is GR/IR and why does it exist?**
  A: GR/IR (Goods Received Not Invoiced) bridges the gap between getting the goods and getting the bill. It lets inventory go up immediately while holding the amount owed until the real invoice arrives — so nothing is missed and nothing is double-counted.
  related: ["Goods Received Not Invoiced (GR/IR)", "Accounts Payable – Trade"]

- **Q: How do I record paying a supplier?**
  A: Debit "Accounts Payable – Trade" (the debt goes down) and credit "Cash in Bank" (cash goes down). If you withheld EWT on the payment, credit "Withholding Tax Payable (EWT)" for that slice and pay the supplier the rest.
  related: ["Accounts Payable – Trade", "Cash in Bank", "Withholding Tax Payable (EWT)"]

- **Q: What happens in the books when I mill paddy into rice?**
  A: Milling is an internal transformation, not a sale — no VAT, no income. Paddy moves out of raw materials, through Work-in-Process, into finished rice (plus bran/husk byproducts). You also add the milling labor/power cost. See the cheat-sheet card "We milled paddy into rice."
  related: ["Inventory – Paddy / Raw Materials", "Work-in-Process", "Inventory – Finished Goods (Rice)", "Inventory – Bran/Husk (Byproduct)", "Milling Conversion Cost (Labor/Power/OH)"]

- **Q: What is Work-in-Process?**
  A: It's a temporary inventory bucket for goods mid-production — paddy that's being milled but isn't finished rice yet. Paddy and milling costs flow IN; finished rice and byproducts flow OUT, leaving WIP empty when the batch is done.
  related: ["Work-in-Process", "Inventory – Paddy / Raw Materials", "Inventory – Finished Goods (Rice)"]

- **Q: What about the bran and husk — are they worth recording?**
  A: Yes. Bran and husk are byproducts. When milling produces them, record them into "Inventory – Bran/Husk (Byproduct)" at their cost/fair value. If you later sell them, that's "Other Income / Byproduct Income". (Feed-grade bran/husk is generally VAT-exempt.)
  related: ["Inventory – Bran/Husk (Byproduct)", "Other Income / Byproduct Income"]

- **Q: Someone brought their own paddy for me to mill (toll milling) — how's that different?**
  A: The grain is theirs, not yours, so it never enters your inventory. You only earn a service fee: debit Cash or AR, credit "Toll Milling Service Revenue (VAT-exempt)". Palay-to-rice milling for others is VAT-exempt. If you keep the byproducts, also record them as byproduct inventory/income.
  related: ["Toll Milling Service Revenue (VAT-exempt)", "Cash on Hand", "Accounts Receivable – Trade", "Inventory – Bran/Husk (Byproduct)", "Other Income / Byproduct Income"]

### Category: VAT

- **Q: Why does my rice have NO VAT?**
  A: Because the law (NIRC Section 109(1)(A)) lists rice in its original state — including husked and polished rice — and palay as VAT-EXEMPT. "Exempt" means no VAT at all, not 0%. So your rice sales account is literally named "Sales – Rice (VAT-exempt)" and you charge no Output VAT.
  related: ["Sales – Rice (VAT-exempt)"]

- **Q: Why do weighing and the vendo machines HAVE 12% VAT but rice doesn't?**
  A: Because weighing is a plain service with no agricultural exemption — it's VATable at 12% if you're VAT-registered. Vendo sales depend on the item: bottled water/snacks are VATable; an exempt agri-product would be exempt. So your "Weighing Service Revenue (VATable)" carries Output VAT, while rice does not. This mix makes you a "mixed-VAT" business.
  related: ["Weighing Service Revenue (VATable)", "Vendo Sales", "Output VAT Payable", "Sales – Rice (VAT-exempt)"]

- **Q: What does "non-creditable input VAT capitalized into cost" mean in plain words?**
  A: Normally the 12% VAT you pay on purchases (Input VAT) is refundable against VAT you charge. But your main output — rice — is exempt, so you CAN'T claim back the VAT on rice-related purchases. Instead, you bury that VAT into the cost of the inventory itself. In short: for the rice side, VAT you pay is just part of what the goods cost you, not a refund you'll get.
  related: ["Inventory – Paddy / Raw Materials", "Input VAT – Clearing (Transitional)"]

- **Q: My business has both VAT-exempt rice and VATable weighing — is that a problem?**
  A: Not a problem, just means you're "mixed-VAT." You charge 12% only on the VATable lines (weighing, VATable goods, some vendo items), nothing on rice/toll-milling. And the VAT you pay on purchases must be split: the part tied to VATable activity is claimable, the part tied to exempt rice is buried into cost. The system separates these via different revenue accounts.
  related: ["Sales – Rice (VAT-exempt)", "Sales – VATable Goods", "Weighing Service Revenue (VATable)", "Output VAT Payable"]

- **Q: Is toll milling (milling someone else's palay) VATable?**
  A: No — "milling for others of palay into rice" is VAT-exempt under NIRC Section 109(1)(F). Do not add 12% to that fee. The exception: toll-processing that is NOT palay-to-rice (or corn-to-grits, cane-to-sugar) would be VATable — classify by what's being milled.
  related: ["Toll Milling Service Revenue (VAT-exempt)"]

- **Q: What is Output VAT vs Input VAT?**
  A: Output VAT is the 12% you charge customers on VATable sales — you owe it to the BIR. Input VAT is the 12% you pay suppliers on purchases — normally claimable back. You net them on the VAT return (2550Q). For your rice side, there's no Output VAT and the Input VAT isn't claimable.
  related: ["Output VAT Payable", "Input VAT – Clearing (Transitional)"]

### Category: Withholding Tax

- **Q: What is EWT (Expanded Withholding Tax)?**
  A: It's a small slice of a payment that the PAYER holds back and remits to the BIR for the payee. Standard rates are 1% on goods and 2% on services (RR 2-98). It's not an extra cost — it's a prepayment of the payee's income tax. The payer gives the payee a Form 2307 proving it.
  related: ["Withholding Tax Payable (EWT)", "Creditable Withholding Tax (CWT) Receivable"]

- **Q: When do I withhold from a supplier vs when does a customer withhold from me?**
  A: When YOU pay a supplier and you're a withholding agent, you hold back 1%/2%, pay the supplier the rest, and the held amount sits in "Withholding Tax Payable (EWT)" until you remit it. When a CUSTOMER pays YOU and withholds, the held slice is your asset — "Creditable Withholding Tax (CWT) Receivable" — and you collect their Form 2307 to credit against your income tax.
  related: ["Withholding Tax Payable (EWT)", "Creditable Withholding Tax (CWT) Receivable"]

- **Q: What is Form 2307 and why do I need it?**
  A: Form 2307 is the BIR certificate that proves tax was withheld. If a customer withholds from you, get their 2307 — it's your receipt to claim that amount as a tax credit (1701Q/1702Q). If you withhold from a supplier, you must issue them a 2307. No 2307, no credit.
  related: ["Creditable Withholding Tax (CWT) Receivable", "Withholding Tax Payable (EWT)"]

- **Q: I withheld tax from suppliers — how do I pay it to the BIR?**
  A: The EWT you held sits in "Withholding Tax Payable (EWT)". You remit it to the BIR using Form 1601-EQ (quarterly) and issue each supplier a Form 2307. Until remitted, it's a real liability that accrues penalties if ignored.
  related: ["Withholding Tax Payable (EWT)", "Cash in Bank"]

- **Q: Do I withhold on paddy bought from farmers?**
  A: Generally no — agricultural products in original state from registered suppliers are typically exempt from EWT, and palay/rice is also VAT-exempt. Withholding (1% goods/2% services) applies to your VATable/registered-supplier purchases. When unsure, check the supplier's registration and the product.
  related: ["Inventory – Paddy / Raw Materials", "Withholding Tax Payable (EWT)"]

### Category: BIR / Compliance

- **Q: What documents must I keep for the BIR?**
  A: Keep BIR-registered Sales Invoices (with an approved number series), Official Receipts for collections, supplier invoices, your Form 2307s (both received and issued), bank deposit slips, and your books of accounts (General Journal, General Ledger, subsidiary ledgers, cash books). These support every figure on your tax returns.
  related: []

- **Q: What are the main returns I'll file?**
  A: VAT return 2550Q (quarterly) if VAT-registered; 1601-EQ (quarterly) to remit EWT you withheld; and income tax 1701Q/1701 (sole proprietor) or 1702Q/1702 (corporation). Non-VAT businesses file 2551Q (3% percentage tax) instead of VAT.
  related: []

- **Q: My Sales Invoices need a "registered series" — what does that mean?**
  A: BIR requires your invoices and receipts to use an officially authorized number sequence (via ATP or an accredited computerized system). You can't just print random numbers. Under the EOPT rules the Sales Invoice is the primary document — it's what records the sale and any VAT.
  related: []

- **Q: Do I charge VAT if I'm not VAT-registered?**
  A: No. Non-VAT businesses don't charge 12% VAT; instead they pay a 3% percentage tax and file 2551Q. Whether you're VAT-registered is a registration decision — confirm your status before assuming any VAT treatment.
  related: []

- **Q: Where do I find my BIR / VAT numbers?**
  A: Open the **BIR Compliance** page. It pulls straight from your posted ledger and prepares, each tied to its GL control account so they reconcile: a **VAT Summary** for the **2550Q** (Output VAT on VATable sales, less any claimable Input VAT), your **Sales and Purchase books**, the **CWT received** register (tax customers withheld from you, with their 2307s), and the **EWT withheld / 1601-EQ** schedule (tax you held back from suppliers). It does the math and the schedules — it does **not** e-file or print the BIR forms, so you still file these with your accountant. One open item: **Vendo output VAT is still being decided** (vendo currently posts zero Output VAT), so the VAT Summary isn't filing-final until that call is made.
  related: ["Output VAT Payable", "Input VAT – Clearing (Transitional)", "Withholding Tax Payable (EWT)", "Creditable Withholding Tax (CWT) Receivable"]

### Category: Is this normal? (Reassurance)

- **Q: Does the system post journal entries automatically?**
  A: Yes — for everything you do day to day. When you record a **Supplier Bill** (Dr GR/IR / Cr Accounts Payable, with EWT held back to Withholding Tax Payable) or its **Payment** (Dr Accounts Payable / Cr Cash), raise a **Sales Invoice** (Dr Accounts Receivable / Cr Sales — rice is VAT-exempt; VATable goods also Cr Output VAT) or post a **Collection** (Dr Cash in Bank + Dr CWT Receivable for any tax the customer withheld / Cr Accounts Receivable), complete a **Milling Batch**, do a **Toll Milling** job, price a **Weighbridge** ticket, or log a **Vendo cash movement** — the system writes the balanced double-entry for you straight into the books. See every entry in **Accounting → General Ledger** (the journal register plus a per-account ledger with running balances). Posted entries are locked: if something's wrong you reverse it, you don't edit it. Two honest caveats: (1) the **cost of the rice you sold (COGS) isn't booked at the moment of sale yet** — an invoice records the revenue and the receivable, but not yet the cost of that rice leaving inventory; and (2) the system **prepares your tax figures but doesn't e-file or print BIR forms** — you still file with your accountant (see the BIR Compliance Q&A).
  related: []

- **Q: My Balance Sheet / Income Statement is empty — did I break something?**
  A: No, nothing's broken. Your books are live and filling up — the system now posts both **buying and selling** (supplier bills, payments, sales invoices, collections) plus milling, toll, weighbridge and vendo, so the **General Ledger** is populating in real time. Open **Accounting → General Ledger** for the journal register and each account's running balance. You also now have two finished report pages: **DCPR (Daily Collection & Payment Report)** for your daily cash in/out per cash account, and **BIR Compliance** for your VAT, sales/purchase books and withholding schedules. What's *still* being finished is the **fully formatted Balance Sheet and Income Statement report pages** — so those two specific pages may look light for now, but the underlying ledger, journal, per-account balances, DCPR and BIR reports are all real and viewable today. (Heads-up: a sale's revenue and receivable show up immediately, but the **cost of the rice sold (COGS) isn't booked yet**, so profit will look high until that's switched on.)
  related: []

- **Q: Is the customer's AR balance live, or do I update it by hand?**
  A: It's live now — no hand-updating. Every **Sales Invoice raises** the customer's receivable and every **Collection lowers** it, and those postings keep the customer's **AR balance maintained automatically** (the updates are idempotency-guarded, so re-running or re-saving won't double-count). That means the **credit-hold check on a Sales Order now reads a real, current balance**, not a typed-in figure — if a customer is over their limit, that's based on actual unpaid invoices. You can cross-check any customer against the **Accounts Receivable – Trade** control account and the per-customer subsidiary ledger in **Accounting → General Ledger**; they should agree. (If a number ever looks surprising, it's usually a collection not yet posted, not a broken balance.)
  related: ["Accounts Receivable – Trade"]

- **Q: I withheld/collected EWT but I don't see it being remitted — is that bad?**
  A: It's captured and on the books, and you can now see it laid out for filing. The purchase/payment and collection entries post automatically, and the new **BIR Compliance** page gives you the prepared schedules: your **1601-EQ / EWT-withheld totals**, the **CWT-received register** (tax customers withheld from you), and the **Sales and Purchase books** — each tied to its GL control account so the figures reconcile. What the system does **not** yet do is **e-file the return or print the Form 2307 certificates** (there's no ATC-capture flow yet). So you still **remit the EWT to the BIR and issue/collect 2307s manually with your accountant** — but now you hand them numbers that are already prepared. Don't skip the manual remittance in the meantime, or you'll accrue penalties.
  related: ["Withholding Tax Payable (EWT)", "Creditable Withholding Tax (CWT) Receivable"]

- **Q: Where do I see my daily cash in and out?**
  A: Open the **DCPR (Daily Collection & Payment Report)**. It shows, per cash account (Cash on Hand, each Cash in Bank), the money that **came in** (collections, vendo, weighbridge, other receipts) and the money that **went out** (supplier payments, expenses) for each day, with running totals. It's built from the same posted entries as your ledger, so the **DCPR ties back to the General Ledger** — if a day looks wrong, the matching journal entry is one click away.
  related: ["Cash on Hand", "Cash in Bank"]

- **Q: Can I really just leave the Chart of Accounts as-is?**
  A: Yes. It's pre-seeded specifically for a Philippine rice mill — rice exempt, weighing VATable, the right inventory and tax buckets. Most users review it once and change nothing. You only add accounts if you genuinely do something the chart doesn't cover.
  related: []

---

## PART 4 — Common Journal Entries Cheat-Sheet Cards

> Render each as a card: `{ event, debit, credit, why }`. Amounts illustrative.

- **Event: We received paddy from a farmer (goods in, bill not yet here)**
  - Debit: Inventory – Paddy / Raw Materials
  - Credit: Goods Received Not Invoiced (GR/IR)
  - Why: Stock goes up now; the amount owed is parked in GR/IR until the supplier's bill arrives. Palay is VAT-exempt, so no Input VAT.

- **Event: The supplier's bill arrived for that paddy**
  - Debit: Goods Received Not Invoiced (GR/IR)
  - Credit: Accounts Payable – Trade (and Withholding Tax Payable (EWT) if you withhold)
  - Why: The temporary GR/IR clears into a real payable to the supplier; any EWT you held back is set aside to remit.

- **Event: We sold rice on credit**
  - Debit: Accounts Receivable – Trade
  - Credit: Sales – Rice (VAT-exempt)
  - Why: Revenue is earned at the sale; the customer owes you. Rice is VAT-exempt, so there is NO Output VAT.

- **Event: We milled paddy into rice (internal production)**
  - Debit: Inventory – Finished Goods (Rice) + Inventory – Bran/Husk (Byproduct)
  - Credit: Work-in-Process
  - Why: Finished rice and byproducts come out of production. (First, paddy and milling cost flow IN: Dr Work-in-Process / Cr Inventory – Paddy and Cr Milling Conversion Cost.) No VAT — it's a transformation, not a sale.

- **Event: We recorded the cost of rice that was delivered/sold (COGS)**
  - Debit: Cost of Goods Sold
  - Credit: Inventory – Finished Goods (Rice)
  - Why: When rice leaves inventory to a customer, its cost becomes an expense, matched against the sale.

- **Event: Customer paid us and withheld tax (e.g. 1%)**
  - Debit: Cash in Bank (net received) + Creditable Withholding Tax (CWT) Receivable (the withheld part)
  - Credit: Accounts Receivable – Trade (full amount owed)
  - Why: They paid you most of it and sent the rest to the BIR for you — that withheld slice is your tax credit. Collect their Form 2307.

- **Event: We charged a weighbridge fee, paid in cash (VATable)**
  - Debit: Cash on Hand
  - Credit: Weighing Service Revenue (VATable) + Output VAT Payable (12%)
  - Why: Weighing is a taxable service — unlike rice, it carries 12% Output VAT that you owe the BIR.

- **Event: We paid the electricity bill**
  - Debit: Utilities (Electricity, Water)
  - Credit: Cash in Bank
  - Why: Running costs are expenses (debit-normal); paying them reduces cash.
