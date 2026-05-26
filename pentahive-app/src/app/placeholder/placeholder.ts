import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-placeholder',
  imports: [],
  template: `
    <div class="ph-shell">
      <div class="ph-mark">
        <span class="ico">{{ icon() }}</span>
      </div>
      <h1>{{ title() }}</h1>
      <p class="muted">This module is on the roadmap. The schema and UI haven't been built yet.</p>
      <div class="meta">
        <span class="chip">Page code: <code>{{ pageCode() }}</code></span>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .ph-shell {
      max-width: 520px;
      margin: 80px auto;
      text-align: center;
      padding: 40px 32px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r12);
      box-shadow: var(--shadow);
    }
    .ph-mark {
      width: 64px; height: 64px;
      border-radius: 18px;
      background: linear-gradient(135deg, var(--gold-bg), transparent);
      border: 1px solid var(--gold-rim);
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 18px;
    }
    .ph-mark .ico { font-size: 28px; }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: var(--text);
    }
    .muted { color: var(--sub); font-size: 0.95rem; max-width: 360px; margin: 0 auto 1.5rem; }
    .meta { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px;
      background: var(--raised);
      border: 1px solid var(--border);
      border-radius: var(--r6);
      font-size: 0.8rem;
      color: var(--sub);
    }
    code {
      font-family: var(--mono);
      color: var(--gold);
    }
  `,
})
export class Placeholder {
  private route = inject(ActivatedRoute);
  private routeData = toSignal(this.route.data, { initialValue: { pageCode: 'unknown', title: 'Coming soon', icon: '🚧' } });

  pageCode = computed(() => this.routeData()?.['pageCode'] ?? 'unknown');
  title    = computed(() => this.routeData()?.['title'] ?? 'Coming soon');
  icon     = computed(() => this.routeData()?.['icon'] ?? '🚧');
}
