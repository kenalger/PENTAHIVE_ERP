import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY = 'pentahive-theme';
type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    // Whenever the signal changes, reflect on <html data-theme="..."> and persist.
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem(STORAGE_KEY, t); } catch { /* localStorage may be blocked */ }
    });
  }

  toggle() {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }

  set(t: Theme) {
    this.theme.set(t);
  }

  private initialTheme(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* ignore */ }
    // Default: prefer OS dark mode; fall back to dark (mockup default).
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'dark';
  }
}
