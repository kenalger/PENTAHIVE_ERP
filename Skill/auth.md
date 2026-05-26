---
name: ErpPentaHive
description: Scaffold a Node.js + Angular app (latest Angular, standalone components, signals) with Supabase authentication in an admin-managed user model — no public signup, admins create accounts with a generated temporary password, and users are forced to change the password on first login. Admin status is determined by a hardcoded email allowlist. User creation runs through a Supabase Edge Function so the service_role key never reaches the browser. Use this skill whenever the user wants admin-managed accounts, in-house user provisioning, no public signup, an admin panel to create users, or any "only admins can add people" auth model in Angular with Supabase. Use it even when the user just says things like "add admin user creation to my Angular app" or "I want to control who gets accounts" — this is the right skill for those.
---

# Angular + Supabase — Admin-Managed Accounts

Bootstrap a Node.js-based Angular app with an admin-only account creation flow on Supabase. Latest Angular (standalone components + signals). No public signup. Admins create users; users get a temp password they must change on first login.

You are running in Claude Code with shell access. Run commands yourself; don't make the user paste them. Pause only when you need information that isn't on disk (Supabase URL, anon key, project ref, admin emails, target directory). Explain the *why* alongside each step — most users following this are learning the patterns.

## Architecture at a glance

```
Angular (browser)                Supabase
─────────────────                ────────
[Admin signs in] ────────────►  Auth (anon key, standard sign-in)
                                          │
                                          ▼
                                JWT returned to browser
                                          │
[Admin opens /admin/users] ──────────────►│
[Submits "create user" form]              │
        │                                 │
        │  POST /functions/v1/create-user │
        │  Authorization: Bearer <admin JWT>
        └────────────────────────────────►│ Edge Function
                                          │  1. Verifies caller JWT
                                          │  2. Checks email against admin allowlist
                                          │  3. Generates temp password
                                          │  4. Calls admin.createUser() with
                                          │     user_metadata.must_change_password = true
                                          │  5. Returns { email, tempPassword }
[Admin shows temp password to user]
[New user signs in with temp password]
[Angular sees must_change_password=true → forces /change-password]
[User submits new password → flag cleared → normal access]
```

Two non-obvious constraints drive the design:

1. **The `service_role` key cannot ship in the Angular bundle.** It bypasses Row-Level Security entirely. The Edge Function is what holds it. Angular only ever sees the `anon` key.
2. **Admin checks happen server-side, in the Edge Function.** Hiding the admin UI in Angular is just convenience — the real authorization is the email-allowlist check inside the function. A motivated attacker can always call your endpoint directly.

## Prerequisites — verify before writing code

1. **Node.js 20 or 22**. Run `node -v`. Angular 18+ requires it.
2. **Supabase CLI**. Needed to deploy the Edge Function. Install per docs: `npm install -g supabase` (or `brew install supabase/tap/supabase` on macOS). Run `supabase --version` to confirm.
3. **Supabase project**. From Dashboard → Project Settings → API:
   - `Project URL` (e.g. `https://xxxxx.supabase.co`)
   - `anon` / `public` key — ships in the browser, safe
   - `service_role` key — **stays on the server, never paste it into Angular**
   - Project ref (the `xxxxx` part of the URL)
4. **Disable public signup in the dashboard**. Authentication → Providers → Email → uncheck "Enable email signup." This is belt-and-suspenders — the Angular app won't show a signup page, but turning it off at the source means nobody can bypass via direct API call.
5. **Admin email list**. Ask the user: "Which email addresses should have admin rights?" Collect at least one. These get hardcoded into the Edge Function and an Angular constant.
6. **First admin account**. Since signup is disabled, the first admin can't sign themselves up. Options:
   - Create the first admin manually via the Supabase dashboard (Authentication → Users → Add user → set a password)
   - Or temporarily re-enable signup, sign up once, then disable it again
   Walk the user through whichever they prefer before running the app.

## Workflow

Run in order. Each phase depends on the previous.

---

### Phase 1 — Scaffold the Angular app

Skip if integrating into an existing app.

```bash
npm install -g @angular/cli
ng new my-app --standalone --routing --style=css --ssr=false
cd my-app
```

### Phase 2 — Install dependencies

```bash
npm install @supabase/supabase-js
```

### Phase 3 — Environment config

```bash
ng generate environments
```

Edit `src/environments/environment.ts` and `src/environments/environment.development.ts`:

```ts
export const environment = {
  production: false,
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
  adminEmails: ['admin@example.com'],  // hardcoded admin allowlist
};
```

The anon key is meant to be public. The `adminEmails` array here is purely for **UI gating** (hide the admin nav link, redirect non-admins away from `/admin/*`). It is *not* the security boundary — the same list lives in the Edge Function, and that's what actually enforces who can create users.

### Phase 4 — Supabase client wrapper

`src/app/supabase.client.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

export const supabase: SupabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,  // no OAuth/magic links in this flow
    },
  }
);
```

### Phase 5 — AuthService

Signals-based. Exposes `user`, `isLoggedIn`, `isAdmin`, and `mustChangePassword` — the last two derived from claims so any component or guard can read them reactively.

`src/app/auth.service.ts`:

```ts
import { Injectable, signal, computed } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase.client';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.user() !== null);

  // Admin status: derived from the hardcoded email allowlist.
  // This is for UI only — the Edge Function enforces it for real.
  readonly isAdmin = computed(() => {
    const email = this.user()?.email?.toLowerCase();
    return !!email && environment.adminEmails
      .map(e => e.toLowerCase())
      .includes(email);
  });

  // Set by the Edge Function when creating a user with a temp password.
  // Cleared after the user successfully updates their password.
  readonly mustChangePassword = computed(() =>
    this.user()?.user_metadata?.['must_change_password'] === true
  );

  constructor() {
    supabase.auth.getSession().then(({ data }) => this.session.set(data.session));
    supabase.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  signOut() {
    return supabase.auth.signOut();
  }

  // Used on the change-password page. Clears the must_change_password flag.
  async changePassword(newPassword: string) {
    return supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },  // clears the flag
    });
  }
}
```

`onAuthStateChange` is the source of truth — *not* the return value of `signIn()`. Setting state from both leads to subtle race conditions.

### Phase 6 — Route guards

Three guards. Functional API.

`src/app/auth.guard.ts` — must be logged in:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    router.navigate(['/login']);
    return false;
  }
  // If they're in must-change state, force them to /change-password
  // before letting them go anywhere else.
  if (data.session.user.user_metadata?.['must_change_password'] === true) {
    router.navigate(['/change-password']);
    return false;
  }
  return true;
};
```

`src/app/admin.guard.ts` — must be logged in AND an admin:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';
import { environment } from '../environments/environment';

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (!data.session) { router.navigate(['/login']); return false; }

  const email = data.session.user.email?.toLowerCase();
  const allowed = environment.adminEmails.map(e => e.toLowerCase());
  if (!email || !allowed.includes(email)) {
    router.navigate(['/home']);
    return false;
  }
  return true;
};
```

`src/app/change-password.guard.ts` — only reachable when actually flagged for change. Without this, anyone could browse to `/change-password` and bypass the lock.

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from './supabase.client';

export const changePasswordGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (!data.session) { router.navigate(['/login']); return false; }
  if (data.session.user.user_metadata?.['must_change_password'] !== true) {
    router.navigate(['/home']);
    return false;
  }
  return true;
};
```

Why guards re-call `getSession()` instead of reading the signal: on a hard reload, the guard can fire before `AuthService`'s constructor finishes hydrating. `getSession()` reads localStorage and resolves immediately, sidestepping that race.

### Phase 7 — UI components

```bash
ng generate component login
ng generate component home
ng generate component change-password
ng generate component admin/users
```

`src/app/login/login.component.ts`:

```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h2>Sign in</h2>
    <form (ngSubmit)="onSubmit()">
      <input type="email" [(ngModel)]="email" name="email" placeholder="Email" required />
      <input type="password" [(ngModel)]="password" name="password" placeholder="Password" required />
      <button type="submit" [disabled]="loading()">
        {{ loading() ? 'Signing in…' : 'Sign in' }}
      </button>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </form>
    <p>Accounts are created by an administrator. Contact your admin if you don't have one.</p>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await this.auth.signIn(this.email, this.password);
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }

    // Route based on whether this user is still on their temp password.
    if (data.user?.user_metadata?.['must_change_password'] === true) {
      this.router.navigate(['/change-password']);
    } else {
      this.router.navigate(['/home']);
    }
  }
}
```

`src/app/change-password/change-password.component.ts`:

```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h2>Set a new password</h2>
    <p>You're signed in with a temporary password. Choose a new one before continuing.</p>
    <form (ngSubmit)="onSubmit()">
      <input type="password" [(ngModel)]="password" name="password"
             placeholder="New password (min 8 chars)" required minlength="8" />
      <input type="password" [(ngModel)]="confirm" name="confirm"
             placeholder="Confirm password" required />
      <button type="submit" [disabled]="loading()">
        {{ loading() ? 'Saving…' : 'Save password' }}
      </button>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </form>
  `,
})
export class ChangePasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  password = '';
  confirm = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit() {
    if (this.password !== this.confirm) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { error } = await this.auth.changePassword(this.password);
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.router.navigate(['/home']);
  }
}
```

`src/app/home/home.component.ts`:

```ts
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Welcome</h2>
    @if (auth.user(); as user) {
      <p>Signed in as {{ user.email }}</p>
    }
    @if (auth.isAdmin()) {
      <p><a routerLink="/admin/users">Manage users</a></p>
    }
    <button (click)="signOut()">Sign out</button>
  `,
})
export class HomeComponent {
  auth = inject(AuthService);
  private router = inject(Router);

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
```

`src/app/admin/users/users.component.ts` — the admin panel. Calls the Edge Function, displays the generated temp password once for the admin to copy and share manually.

```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../supabase.client';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h2>Create user</h2>
    <form (ngSubmit)="onSubmit()">
      <input type="email" [(ngModel)]="email" name="email"
             placeholder="New user's email" required />
      <button type="submit" [disabled]="loading()">
        {{ loading() ? 'Creating…' : 'Create account' }}
      </button>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </form>

    @if (createdUser(); as u) {
      <div class="result">
        <h3>Account created</h3>
        <p><strong>Email:</strong> {{ u.email }}</p>
        <p><strong>Temporary password:</strong> <code>{{ u.tempPassword }}</code></p>
        <p>
          Share these with the user via a secure channel.
          They'll be required to change the password on first login.
          <em>This password will not be shown again.</em>
        </p>
      </div>
    }
  `,
})
export class UsersComponent {
  email = '';
  loading = signal(false);
  error = signal<string | null>(null);
  createdUser = signal<{ email: string; tempPassword: string } | null>(null);

  async onSubmit() {
    this.loading.set(true);
    this.error.set(null);
    this.createdUser.set(null);

    // Get the current session's access token to send to the Edge Function.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { this.error.set('Not signed in.'); this.loading.set(false); return; }

    // supabase.functions.invoke handles the URL, headers, and auth token automatically.
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email: this.email },
    });

    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    if (data?.error) { this.error.set(data.error); return; }

    this.createdUser.set({ email: data.email, tempPassword: data.tempPassword });
    this.email = '';
  }
}
```

### Phase 8 — Routes

`src/app/app.routes.ts`:

```ts
import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { ChangePasswordComponent } from './change-password/change-password.component';
import { UsersComponent } from './admin/users/users.component';
import { authGuard } from './auth.guard';
import { adminGuard } from './admin.guard';
import { changePasswordGuard } from './change-password.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [changePasswordGuard] },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: 'admin/users', component: UsersComponent, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: 'login' },
];
```

No `/signup` route exists. Anyone hitting an unknown URL lands on `/login`.

### Phase 9 — Edge Function (`create-user`)

This is the security-critical piece. Run all commands from the Angular project root.

```bash
# Initialize Supabase in the project (creates ./supabase directory)
supabase init

# Log in to the CLI (opens browser)
supabase login

# Link to the remote project — get the project ref from the dashboard URL
supabase link --project-ref YOUR-PROJECT-REF

# Create the function
supabase functions new create-user
```

Replace the contents of `supabase/functions/create-user/index.ts` with:

```ts
// Supabase Edge Functions run on Deno, not Node — note the import style.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Hardcoded admin allowlist. Keep in sync with environment.adminEmails in Angular.
const ADMIN_EMAILS = [
  'admin@example.com',
];

// Generate a reasonably strong temp password.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  // CORS preflight — Angular dev server is on a different origin from the function.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Verify the caller's JWT.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401, headers: cors });
    }
    const token = authHeader.slice('Bearer '.length);

    // Use the anon key just to validate the token — getUser() verifies the signature.
    const verifier = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userErr } = await verifier.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors });
    }

    // 2. Authorization: caller must be in the admin allowlist.
    const callerEmail = userData.user.email?.toLowerCase();
    if (!callerEmail || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(callerEmail)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }

    // 3. Parse and validate input.
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: cors });
    }

    // 4. Create the user with a temp password and the must_change_password flag.
    //    The service_role client has admin privileges — keep it confined to this function.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,  // skip the confirmation email — admin vouches for them
      user_metadata: { must_change_password: true },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: cors });
    }

    return new Response(
      JSON.stringify({ email: created.user.email, tempPassword }),
      { status: 200, headers: cors },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: cors },
    );
  }
});
```

Deploy it:

```bash
supabase functions deploy create-user
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are **automatically injected** by Supabase into Edge Functions at runtime. You don't need to set them manually.

**Keep `ADMIN_EMAILS` in the function in sync with `environment.adminEmails` in Angular.** They serve different purposes (server-side enforcement vs client-side UI gating) but if they drift, an admin might see the UI yet fail to actually create users, or vice versa. A tidy version of this would read the list from a database table — see "If the user asks for more" at the bottom.

### Phase 10 — Run and test

```bash
ng serve
```

Manual checklist:

1. Confirm at least one admin user exists in the dashboard (see prereq #6).
2. Visit `http://localhost:4200` → redirected to `/login`.
3. Try `/home` or `/admin/users` directly → bounced to `/login`.
4. Sign in as the admin → land on `/home`. The "Manage users" link should be visible.
5. Sign in as a non-admin (create a second user via the dashboard if needed) → `/home` works, but `/admin/users` redirects back to `/home`.
6. As admin, go to `/admin/users`, enter a new email, submit. The form should display the email + temporary password.
7. Sign out, sign in as the new user with the temp password → forced to `/change-password`, can't navigate elsewhere.
8. Submit a new password → land on `/home`. Sign out and sign in again with the new password → goes straight to `/home`, no password change prompt. Confirms the flag was cleared.

If step 6 returns CORS or 401 errors, see the pitfalls section.

---

## Common pitfalls — flag these proactively

- **`service_role` in Angular**: never. If the user pastes a key starting with `eyJ...` and labeled service_role into `environment.ts`, stop and replace it with the anon key. Service role bypasses all Row-Level Security.
- **Edge Function returns 401 on calls from Angular**: the JWT isn't being sent. `supabase.functions.invoke` attaches the current session's token automatically — confirm the admin is actually signed in at the time of the call.
- **CORS errors hitting the function**: the function's `OPTIONS` handler must return the right headers. The code above handles this; if the user wrote a custom function, this is usually the cause.
- **"User already registered" on create**: Supabase rejects duplicate emails. Surface the error message to the admin.
- **Admin list drift between Angular and the function**: change one, change the other. A real production setup would centralize this — see below.
- **First-admin chicken-and-egg**: with signup disabled, you can't sign up the first admin via the app. Always create the first admin via the Supabase dashboard before testing.
- **Forced password change isn't enforced**: the `authGuard` checks `must_change_password` on every protected route activation. If a route is missing that guard, the user can browse there. Apply `authGuard` to every protected route.
- **User changes password but flag stays true**: `updateUser` accepts both `password` and `data` in one call; if the user only sets the password and forgets `data: { must_change_password: false }`, the flag persists and they're stuck in the loop. The `changePassword` method on `AuthService` does both — use it.

## If the user asks for more

- **Admin list in a database instead of hardcoded**: create a `profiles` table with `id uuid references auth.users(id) primary key` and `is_admin boolean default false`. The Edge Function queries it: `select is_admin from profiles where id = $caller_id`. Angular can read it too (with appropriate RLS) and store it on the AuthService. Eliminates the drift problem.
- **Delete / list / disable users**: extend the same Edge Function pattern. `admin.auth.admin.listUsers()`, `admin.auth.admin.deleteUser(id)`, `admin.auth.admin.updateUserById(id, { ban_duration: '24h' })`. Same JWT verification + allowlist check at the top of each.
- **Email the temp password instead of showing it on screen**: trade convenience for sending the credential over email (less secure than a verbal/Signal/etc. handoff, but easier to operate). Use Supabase's `admin.inviteUserByEmail()` instead — it sends an invite with a link to set their own password, which sidesteps the temp-password handling entirely. Note that this changes the flow: the user sets their *first* password via the invite link, not via a forced change on login. Different UX, simpler code.
- **Password reset for users who forget their password**: standard Supabase flow — `resetPasswordForEmail(email, { redirectTo: '/change-password' })`. The recovery session is a temporary auth state granted by the link, so the `/change-password` route should *not* have the change-password guard applied if you want it to double as the reset destination — or use a separate `/reset-password` route.

## Style guidance

Narrate the *why* alongside the code. The two most important "whys" in this skill:

1. **Why the Edge Function exists**: because user creation needs the service_role key, and that key can't ship in the browser. Without explaining this, the architecture looks like over-engineering.
2. **Why admin checks happen in two places**: Angular for UX (hide the nav link, redirect away from admin pages), function for security (the real authorization boundary). Users sometimes try to "DRY this up" by removing one — that's a mistake.

Keep code blocks complete and runnable. If the user is clearly experienced, tighten the prose; if they're learning, expand the explanations.