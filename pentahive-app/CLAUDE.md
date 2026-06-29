# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # ng serve — dev server at http://localhost:4200/ (development config)
npm run build          # ng build — production build to dist/ (default config is production)
npm run watch          # ng build --watch, development config
npm test               # ng test — Vitest via @angular/build:unit-test
```

There is no lint script configured. Prettier is a devDependency; format with `npx prettier`.

Single test: Vitest is the runner. Use `npx vitest run path/to/file.spec.ts` or `npx vitest -t "test name"` for a focused run. Specs live next to source as `*.spec.ts` (currently only `src/app/app.spec.ts`, which is the CLI-generated default and asserts a "Hello, pentahive-app" `<h1>` that no longer matches the real app shell — treat it as stale).

## Architecture

Angular 21 standalone-component SPA (no NgModules) backed by Supabase. Brand is **"WVW ERP"** in the UI; the npm/package name is still `pentahive-app`.

### Routing & the workspace model (`src/app/app.routes.ts`)
Routes are organized around **workspaces** (e.g. `milling`, `hardware`). The app is multi-tenant-ish: a signed-in user lands on the **workspace picker** (`/`), then enters a workspace whose path prefixes all its modules (e.g. `/milling/sales-orders`).

- Every route is lazy-loaded via `loadComponent`.
- The `milling` workspace mounts `shell/shell.ts` as its layout and nests ~20 child module routes inside it (Operations, Sales, Procurement, Accounting, etc.). The shell keeps sidebar + topbar fixed while the `<router-outlet>` swaps modules.
- Routes that aren't built yet use the `ph(pageCode, title, icon)` helper → `placeholder/placeholder.ts`.
- `withPreloading(PreloadAllModules)` is set in `app.config.ts`, so lazy chunks preload after initial load.

### Auth & access control — three layers
1. **Supabase Auth** session, wrapped by `auth.service.ts` (singleton, signal-based). Exposes `session`/`user`/`isLoggedIn` signals and reactive `isAdmin`/`isManager`/`mustChangePassword` computeds. The Supabase client is a module-level singleton in `supabase.client.ts` — import `{ supabase }` directly; do not create new clients.
2. **Route guards** (`*.guard.ts`, all `CanActivateFn`):
   - `authGuard` — signed in.
   - `changePasswordGuard` — forces the change-password flow when `user_metadata.must_change_password`.
   - `workspaceGuard` — reads `route.data.workspace`, calls RPC `user_has_workspace`; fails closed to `/`.
   - `pageAccessGuard` — reads `route.data.pageCode`, calls RPC `can_enter_page`; fails closed to `/dashboard`. **Every protected module route must set `data: { pageCode }`** or the guard denies it.
3. **Fine-grained permissions** for in-page UI gating. `AuthService.loadAccess()` pulls roles from `user_roles` and an OR-union of effective permissions from the `v_user_effective_access` view. Use `auth.canDo(pageCode, action)` (`'view' | 'create' | 'edit' | 'delete' | 'approve'`) to show/hide buttons. Semantics mirror the DB: admin → everything; manager → approve on everything; otherwise the grant decides.

The real authorization is enforced server-side (DB RPCs/RLS + Edge Functions). The client checks are UX gating only. `environment.adminEmails` is a **fallback allowlist** for first-paint/hard-reload before access loads — not the source of truth.

### Module component pattern
Each ERP module is a single standalone component (e.g. `sales-orders/sales-orders.ts`) with an **inline template and inline styles** — this codebase deliberately inlines everything (templates, styles, even SVG icons) rather than splitting into `.html`/`.css` files. Conventions:
- State via signals (`signal`, `computed`); `inject(AuthService)` for permissions; query Supabase directly with the imported `supabase` client.
- Domain types (`SO`, `Line`, `CustomerLite`, …) are declared at the top of the file; `EMPTY_FORM()`/`EMPTY_LINE()` factory functions seed create forms.
- Forms use `FormsModule` (template-driven / `ngModel`), not reactive forms.
- Dialogs use the shared `ui/modal.ts` (`<app-modal [open] [title] (closed)>`). All modals route through this one component, so modal/backdrop styling is centralized there.

### Design system (see also the user's `jkl-erp-design-system` memory)
- **Monochrome** chrome (black/white/grey) for all interface; red/green survive only in data (money/status). Driven by CSS custom properties in `src/styles.css` (`--gold*` tokens were repointed to ink, so re-skinning happens at the token level).
- **Icons:** `ui/icon.ts` — inline Lucide SVGs, zero runtime dep, strokes inherit `currentColor`. Usage `<app-icon name="truck" [size]="18" />`. To add an icon, paste its inner Lucide markup into the `ICONS` map. Legacy emoji icons still appear in some templates and are being purged.
- `ui/modal.ts`, `ui/icon.ts` are the shared UI primitives.
- `shell/shell.ts` is the live workspace layout. `shared/app-shell.ts` is legacy/unused.

### Supabase / environment
- Config lives in `src/environments/environment.ts` (prod) and `environment.development.ts`, swapped by the build's `fileReplacements`. Holds `supabaseUrl`, `supabaseAnonKey`, `adminEmails`. The anon key is a publishable client key (safe for the browser); real protection is RLS + server-side checks.
- Backend logic lives in Supabase: RPCs (`can_enter_page`, `user_has_workspace`), the `v_user_effective_access` view, tables (`user_roles`, `roles`, `workspaces`, plus per-module tables), and Edge Functions for privileged operations (e.g. admin actions).
