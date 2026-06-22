import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icon],
  template: `
    <div class="auth-shell">
      <aside class="auth-brand">
        <div class="brand-top">
          <div class="brand-mark">
            <span class="hex"><app-icon name="hexagon" [size]="20" /></span>
            <span class="brand-name">RJL ERP</span>
          </div>
          <span class="brand-tag">Enterprise Resource Platform</span>
        </div>

        <div class="brand-hero">
          <h1>Run every department<br />from one secure hub.</h1>
          <p>Finance, HR, Inventory, Sales and Operations — unified workflows, real-time data, role-based access.</p>

          <ul class="brand-points">
            <li><span class="dot"></span> Granular page-level permissions</li>
            <li><span class="dot"></span> Approval workflows out of the box</li>
            <li><span class="dot"></span> Audit-ready activity history</li>
          </ul>
        </div>

        <div class="brand-foot">
          <span>© {{ year }} RJL ERP</span>
          <span class="dot-sep">•</span>
          <span>v1.0</span>
        </div>
      </aside>

      <section class="auth-pane">
        <div class="auth-card">
          <header class="auth-head">
            <h2>Sign in</h2>
            <p class="sub">Use your work email and password to access the workspace.</p>
          </header>

          <form class="auth-form" (ngSubmit)="onSubmit()">
            <div class="ph-field">
              <label class="ph-label" for="email">Email</label>
              <input id="email" class="ph-input" type="email"
                     [(ngModel)]="email" name="email"
                     placeholder="you@company.com" autocomplete="email" required />
            </div>

            <div class="ph-field">
              <label class="ph-label" for="password">Password</label>
              <input id="password" class="ph-input" type="password"
                     [(ngModel)]="password" name="password"
                     placeholder="••••••••" autocomplete="current-password" required />
            </div>

            @if (error()) {
              <div class="ph-alert ph-alert-error">{{ error() }}</div>
            }

            <button type="submit" class="ph-btn ph-btn-primary ph-btn-block"
                    [disabled]="loading()">
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <footer class="auth-foot">
            Accounts are provisioned by an administrator.
            <br />
            Contact your admin if you don't have credentials yet.
          </footer>
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; }

    .auth-shell {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
      min-height: 100vh;
    }

    /* ---------- Brand panel ---------- */
    .auth-brand {
      position: relative;
      padding: 2.5rem 3rem;
      color: #e2e8f0;
      background:
        radial-gradient(1200px 600px at -10% 110%, rgba(99, 102, 241, 0.35), transparent 60%),
        radial-gradient(900px 500px at 110% -10%, rgba(37, 99, 235, 0.35), transparent 55%),
        linear-gradient(160deg, #0b1220 0%, #111a2e 60%, #0b1220 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .auth-brand::before {
      content: "";
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(180deg, transparent, #000 35%, #000 70%, transparent);
      pointer-events: none;
    }

    .brand-top, .brand-hero, .brand-foot { position: relative; z-index: 1; }

    .brand-mark {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .hex {
      display: inline-flex;
      align-items: center; justify-content: center;
      width: 34px; height: 34px;
      border-radius: 9px;
      background: linear-gradient(135deg, #ffffff, #cbd5e1);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
      color: #0B1118;
    }
    .brand-tag {
      display: block;
      margin-top: 0.4rem;
      font-size: 0.78rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .brand-hero h1 {
      color: #fff;
      font-size: clamp(1.7rem, 2.4vw, 2.4rem);
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.9rem;
    }
    .brand-hero p {
      color: #cbd5e1;
      font-size: 0.97rem;
      max-width: 460px;
      margin: 0 0 1.6rem;
    }
    .brand-points {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      color: #cbd5e1;
      font-size: 0.92rem;
    }
    .brand-points li { display: flex; align-items: center; gap: 0.7rem; }
    .dot {
      width: 8px; height: 8px; border-radius: 999px;
      background: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
    }

    .brand-foot {
      color: #64748b;
      font-size: 0.78rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .dot-sep { opacity: 0.6; }

    /* ---------- Form panel ---------- */
    .auth-pane {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: var(--ph-bg);
    }
    .auth-card {
      width: 100%;
      max-width: 420px;
      background: var(--ph-surface);
      border: 1px solid var(--ph-border);
      border-radius: var(--ph-radius-lg);
      box-shadow: var(--ph-shadow-lg);
      padding: 2.25rem 2rem;
    }
    .auth-head h2 {
      font-size: 1.5rem;
      margin-bottom: 0.35rem;
    }
    .auth-head .sub {
      color: var(--ph-muted);
      margin: 0 0 1.5rem;
      font-size: 0.9rem;
    }
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .auth-foot {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--ph-border);
      font-size: 0.82rem;
      color: var(--ph-muted);
      text-align: center;
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 880px) {
      .auth-shell { grid-template-columns: 1fr; }
      .auth-brand {
        padding: 1.75rem 1.5rem;
        min-height: auto;
      }
      .brand-hero h1 { font-size: 1.5rem; }
      .brand-hero p, .brand-points { display: none; }
      .auth-pane { padding: 1.5rem; }
      .auth-card { padding: 1.75rem 1.5rem; }
    }
  `,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  year = new Date().getFullYear();

  async onSubmit() {
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await this.auth.signIn(this.email, this.password);
    if (error) { this.loading.set(false); this.error.set(error.message); return; }

    if (data.user?.user_metadata?.['must_change_password'] === true) {
      this.loading.set(false);
      this.router.navigate(['/change-password']);
      return;
    }

    // Verify role + page access before sending the user to the workspace picker.
    // onAuthStateChange will fire loadAccess too, but awaiting here guarantees
    // the picker renders with populated signals on first paint.
    await this.auth.loadAccess();
    this.loading.set(false);
    this.router.navigate(['/']);
  }
}
