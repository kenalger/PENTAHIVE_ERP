import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-change-password',
  imports: [FormsModule],
  template: `
    <div class="cp-shell">
      <div class="cp-card">
        <div class="cp-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>

        <header class="cp-head">
          <h2>Set a new password</h2>
          <p class="sub">
            You're signed in with a temporary password. Choose a new one before continuing.
          </p>
        </header>

        <form class="cp-form" (ngSubmit)="onSubmit()">
          <div class="ph-field">
            <label class="ph-label" for="pw">New password</label>
            <input id="pw" class="ph-input" type="password"
                   [(ngModel)]="password" name="password"
                   placeholder="At least 8 characters"
                   autocomplete="new-password" required minlength="8" />
          </div>

          <div class="ph-field">
            <label class="ph-label" for="confirm">Confirm password</label>
            <input id="confirm" class="ph-input" type="password"
                   [(ngModel)]="confirm" name="confirm"
                   placeholder="Re-enter your new password"
                   autocomplete="new-password" required />
          </div>

          <ul class="cp-rules">
            <li [class.ok]="password.length >= 8">
              <span class="check"></span> Minimum 8 characters
            </li>
            <li [class.ok]="confirm.length > 0 && password === confirm">
              <span class="check"></span> Passwords match
            </li>
          </ul>

          @if (error()) {
            <div class="ph-alert ph-alert-error">{{ error() }}</div>
          }

          <button type="submit" class="ph-btn ph-btn-primary ph-btn-block"
                  [disabled]="loading()">
            {{ loading() ? 'Saving…' : 'Save password' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--ph-bg); }

    .cp-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
      background:
        radial-gradient(800px 400px at 50% -10%, rgba(37, 99, 235, 0.10), transparent 60%),
        var(--ph-bg);
    }
    .cp-card {
      width: 100%;
      max-width: 460px;
      background: var(--ph-surface);
      border: 1px solid var(--ph-border);
      border-radius: var(--ph-radius-lg);
      box-shadow: var(--ph-shadow-lg);
      padding: 2rem 2rem 1.75rem;
    }
    .cp-icon {
      width: 44px; height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--ph-brand-600), var(--ph-accent-600));
      color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 1rem;
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
    }
    .cp-head h2 {
      font-size: 1.35rem;
      margin-bottom: 0.3rem;
    }
    .cp-head .sub {
      color: var(--ph-muted);
      margin: 0 0 1.4rem;
      font-size: 0.9rem;
    }

    .cp-form { display: flex; flex-direction: column; gap: 1rem; }

    .cp-rules {
      list-style: none;
      padding: 0;
      margin: 0.25rem 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.82rem;
      color: var(--ph-muted);
    }
    .cp-rules li { display: flex; align-items: center; gap: 0.55rem; }
    .cp-rules .check {
      width: 14px; height: 14px;
      border-radius: 999px;
      background: var(--ph-surface-2);
      border: 1px solid var(--ph-border-2);
      position: relative;
      flex: 0 0 auto;
    }
    .cp-rules li.ok { color: var(--ph-success-700); }
    .cp-rules li.ok .check {
      background: var(--ph-success-600);
      border-color: var(--ph-success-600);
    }
    .cp-rules li.ok .check::after {
      content: "";
      position: absolute; inset: 2px;
      background: #fff;
      clip-path: polygon(14% 50%, 0 64%, 38% 100%, 100% 22%, 86% 8%, 38% 70%);
    }
  `,
})
export class ChangePassword {
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
