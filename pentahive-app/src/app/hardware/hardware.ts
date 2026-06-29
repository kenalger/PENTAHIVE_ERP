import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../theme.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-hardware',
  imports: [RouterLink],
  template: `
    <div class="hw-shell">
      <header class="hw-head">
        <div class="brand">
          <span class="brand-mark">🔧</span>
          <div>
            <div class="brand-name">Hardware</div>
            <div class="brand-tag">WVW ERP Workspace · Coming Soon</div>
          </div>
        </div>
        <div class="actions">
          <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="theme.toggle()">
            {{ theme.theme() === 'dark' ? '☀ Light' : '🌙 Dark' }}
          </button>
          <a class="ph-btn ph-btn-ghost ph-btn-sm" routerLink="/">⇆ Switch workspace</a>
          <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="signOut()">⎋ Sign out</button>
        </div>
      </header>

      <section class="hw-body">
        <div class="hw-card">
          <div class="hw-ico">🚧</div>
          <h1>Hardware workspace is on the way</h1>
          <p>
            This workspace will host hardware-store operations: parts catalog, repair tickets,
            equipment rentals, vendor management. The schema and modules haven't shipped yet.
          </p>
          <p class="muted">
            For now, head back to the workspace picker and choose <strong>Milling</strong>.
          </p>
          <a class="ph-btn ph-btn-primary" routerLink="/">← Back to workspaces</a>
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--void); }
    .hw-shell {
      min-height: 100vh;
      max-width: 1080px; margin: 0 auto;
      padding: 40px 32px;
      display: flex; flex-direction: column; gap: 40px;
    }
    .hw-head { display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 44px; height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--sky), var(--sky-d));
      color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 22px;
      box-shadow: 0 6px 18px rgba(59,130,246,.3);
    }
    .brand-name { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -.4px; }
    .brand-tag { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); margin-top: 2px; }
    .actions { display: flex; gap: 8px; }

    .hw-body {
      flex: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 40px 0;
    }
    .hw-card {
      max-width: 560px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 48px 40px;
      text-align: center;
      box-shadow: var(--shadow);
    }
    .hw-ico {
      width: 72px; height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, var(--sky-bg), transparent);
      border: 1px solid var(--sky-rim);
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 18px;
      font-size: 32px;
    }
    h1 {
      font-size: 1.6rem;
      color: var(--text);
      margin-bottom: 12px;
    }
    p { color: var(--sub); margin-bottom: 14px; max-width: 440px; margin-left: auto; margin-right: auto; }
    .muted { color: var(--dim); font-size: 0.85rem; }
    .ph-btn { margin-top: 12px; }

    @media (max-width: 720px) {
      .hw-shell { padding: 24px 18px; gap: 24px; }
      .hw-head { flex-direction: column; align-items: flex-start; gap: 12px; }
      .hw-card { padding: 36px 24px; }
    }
  `,
})
export class Hardware {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
