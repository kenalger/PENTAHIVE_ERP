---
name: pentahive-chart-of-accounts
description: Chart of Accounts maintenance feature in JKL ERP — 4-level hierarchy adapted from s2-erpfrontend; schema, page code, and reference location
metadata:
  type: project
---

Built a **Chart of Accounts maintenance** feature in pentahive-app (JKL ERP) on 2026-06-13, replicating the s2-erpfrontend / Paylalo accounting structure.

**s2-erpfrontend reference is NOT on this machine** — but its COA schema lives at `C:\Users\itjlo\source\repos\StandAloneApps\DailyCashPosition.Supabase\migrations\0009_chart_of_accounts_and_presets.sql` (header: "s2-erpfrontend (Paylalo Accounting)… mirrors the Sinz/MHI ERP schema"). That repo is the canonical reference for s2 accounting structure. The full s2 model is multi-tenant (companyId → companies, RLS via current_company_id()); JKL is single-tenant.

**4-level hierarchy:** Group (REAL/NOMINAL/FINANCIAL — presentation classifiers, no posting logic) → Class → Subclass (side DEBIT/CREDIT, prefix, cf_category) → Title (postable leaf: acc_name, acc_code, side, subsidiary[]). The s2 schema also has an Accounting **Presets** engine (acc_modules/transactions/preset_types/formulas/presets/preset_details) = the posting-rules layer mapping each transaction type to Dr/Cr accounts — DEFERRED; it's the natural Phase-1 GL follow-on.

**What we built in Supabase `zpfkhcnxtiyojodtmepn` (migration `add_chart_of_accounts`):** tables `acc_groups/acc_classes/acc_subclasses/acc_titles/acc_coa_history`, snake_case cols, INT identity PKs, single-tenant (no companyId). `acc_titles.id` is the designed FK anchor for a future `journal_lines.account_id`; `subsidiary text[]` (BANK/CUSTOMER/SUPPLIER/EMPLOYEE) for AR/AP sub-ledgers. RLS = 18 per-command policies `can_access(auth.uid(),'chart-of-accounts',<action>)`. Page registered in `pages` (code `chart-of-accounts`, workspace `milling`). Seeded 3 groups / 7 classes / 12 subclasses / 44 titles from Beru's classification (rice-mill PH COA). Frontend: `src/app/chart-of-accounts/chart-of-accounts.ts` (4-level expandable tree, level-aware modal, soft-delete via is_active, audit to acc_coa_history), route under Accounting + nav in shell.ts + `library` icon.

**Open / untested:** non-admin RLS path not yet verified (admin short-circuits can_access; need an access_definition grant on the page via the admin UI). Title re-parenting unsupported by design. See [[pentahive-accounting-gap]] (no GL posting engine yet) and [[pentahive-auth-model]].
