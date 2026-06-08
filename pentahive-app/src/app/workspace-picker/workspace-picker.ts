import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';
import { supabase } from '../supabase.client';
import { Icon } from '../ui/icon';

interface Workspace {
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  status: 'active' | 'coming_soon' | 'disabled';
  sort_order: number;
}

@Component({
  selector: 'app-workspace-picker',
  imports: [RouterLink, Icon],
  template: `
    <div class="wp-shell">
      <header class="wp-head">
        <div class="brand">
          <span class="brand-mark"><app-icon name="hexagon" [size]="22" /></span>
          <div>
            <div class="brand-name">JKL ERP</div>
            <div class="brand-tag">Enterprise Resource Platform</div>
          </div>
        </div>
        <div class="actions">
          <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="theme.toggle()">
            {{ theme.theme() === 'dark' ? '☀ Light' : '🌙 Dark' }}
          </button>
          <button class="ph-btn ph-btn-ghost ph-btn-sm" (click)="signOut()">⎋ Sign out</button>
        </div>
      </header>

      <section class="wp-hero">
        <h1>Choose a workspace</h1>
        <p class="sub">
          Welcome back@if (displayName(); as n) {<span>, <strong>{{ n }}</strong></span>}.
          Pick the workspace you want to work in. Your access has been pre-filtered to what's available to you.
        </p>
      </section>

      <section class="wp-content">
        @if (loading()) {
          <p class="muted">Loading workspaces…</p>
        } @else if (error()) {
          <div class="ph-alert ph-alert-error">{{ error() }}</div>
        } @else if (workspaces().length === 0) {
          <div class="ph-alert ph-alert-warn">
            You don't have access to any workspace yet. Ask an administrator to assign you an access bundle.
          </div>
        } @else {
          <div class="ws-grid">
            @for (w of workspaces(); track w.code) {
              @if (w.status === 'active') {
                <a [routerLink]="['/', w.code]" class="ws-card" [class.active]="w.status === 'active'">
                  <div class="ws-ico">{{ w.icon || '⬣' }}</div>
                  <div class="ws-name">{{ w.name }}</div>
                  <div class="ws-desc">{{ w.description || 'No description.' }}</div>
                  <div class="ws-foot">
                    <span class="enter">Enter →</span>
                  </div>
                </a>
              } @else {
                <div class="ws-card disabled" [title]="'Coming soon'">
                  <div class="ws-ico">{{ w.icon || '⬣' }}</div>
                  <div class="ws-name">{{ w.name }}</div>
                  <div class="ws-desc">{{ w.description || 'No description.' }}</div>
                  <div class="ws-foot">
                    <span class="badge">Coming soon</span>
                  </div>
                </div>
              }
            }
          </div>
        }

      </section>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--void); }

    .wp-shell {
      min-height: 100vh;
      max-width: 1080px;
      margin: 0 auto;
      padding: 40px 32px;
      display: flex; flex-direction: column;
      gap: 40px;
    }

    .wp-head {
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 44px; height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--gold), var(--gold-d));
      color: var(--gold-text);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 700;
      box-shadow: var(--shadow);
    }
    .brand-name { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -.4px; }
    .brand-tag { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); margin-top: 2px; }
    .actions { display: flex; gap: 8px; }

    .wp-hero {
      text-align: left;
      padding: 16px 0 4px;
    }
    .wp-hero h1 {
      font-size: clamp(1.8rem, 3vw, 2.4rem);
      font-weight: 700; color: var(--text);
      letter-spacing: -.02em;
      margin-bottom: 0.5rem;
    }
    .wp-hero .sub {
      color: var(--sub);
      font-size: 0.95rem;
      max-width: 640px;
    }

    .wp-content { display: flex; flex-direction: column; gap: 24px; }

    .ws-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }

    .ws-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      padding: 24px;
      text-decoration: none;
      color: var(--text);
      display: flex; flex-direction: column;
      gap: 8px;
      position: relative;
      transition: transform .15s, box-shadow .2s, border-color .15s;
      box-shadow: var(--shadow);
      min-height: 200px;
    }
    .ws-card.active::before {
      content: ''; position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px; border-radius: var(--r12) var(--r12) 0 0;
      background: linear-gradient(90deg, var(--gold), var(--gold-d));
    }
    .ws-card:hover {
      transform: translateY(-3px);
      box-shadow: var(--shadow-lg);
      border-color: var(--gold);
      text-decoration: none;
    }
    .ws-card.disabled {
      opacity: 0.55;
      cursor: not-allowed;
      filter: grayscale(0.4);
    }
    .ws-card.disabled:hover { transform: none; border-color: var(--border); box-shadow: var(--shadow); }
    .ws-ico { font-size: 40px; }
    .ws-name { font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -.01em; }
    .ws-desc { font-size: 12.5px; color: var(--sub); flex: 1; line-height: 1.5; }
    .ws-foot { margin-top: 8px; }
    .enter { color: var(--gold); font-weight: 700; font-size: 13px; }
    .badge {
      display: inline-block;
      background: var(--raised);
      color: var(--sub);
      font-size: 10px; font-weight: 700;
      padding: 4px 10px; border-radius: var(--r4);
      text-transform: uppercase; letter-spacing: .08em;
    }

    .muted { color: var(--sub); }

    @media (max-width: 720px) {
      .wp-shell { padding: 24px 18px; gap: 24px; }
      .wp-head { flex-direction: column; align-items: flex-start; gap: 12px; }
    }
  `,
})
export class WorkspacePicker {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);

  workspaces = signal<Workspace[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  displayName = computed(() => {
    const u = this.auth.user();
    return (u?.user_metadata?.['full_name'] as string) || u?.email?.split('@')[0] || null;
  });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    const uid = this.auth.user()?.id;
    if (!uid) {
      // Wait one tick for hydration
      setTimeout(() => this.load(), 100);
      return;
    }
    const { data, error } = await supabase.rpc('user_workspaces', { p_user_id: uid });
    this.loading.set(false);
    if (error) { this.error.set(error.message); return; }
    this.workspaces.set((data ?? []) as Workspace[]);
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
