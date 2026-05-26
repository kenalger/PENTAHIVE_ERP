import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-modal',
  imports: [],
  template: `
    @if (open) {
      <div class="modal-bg" (click)="onBackdropClick($event)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-h">
            <div class="modal-h-t">{{ title }}</div>
            <button class="modal-close" type="button" (click)="dismiss()" aria-label="Close">×</button>
          </div>
          <ng-content />
        </div>
      </div>
    }
  `,
  styles: `
    .modal-bg {
      position: fixed; inset: 0;
      background: rgba(6,10,15,.7);
      backdrop-filter: blur(4px);
      z-index: 50;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: fadeIn .15s ease;
    }
    .modal {
      background: var(--surface);
      border: 1px solid var(--rim);
      border-radius: var(--r12);
      padding: 22px;
      max-width: 720px;
      width: 100%;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      animation: modalIn .2s cubic-bezier(.4,0,.2,1);
    }
    .modal-h {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .modal-h-t {
      font-size: 15px; font-weight: 700;
      color: var(--text);
    }
    .modal-close {
      background: none; border: none;
      color: var(--sub); font-size: 22px;
      cursor: pointer; line-height: 1;
      padding: 0; width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--r6);
    }
    .modal-close:hover { color: var(--text); background: var(--raised); }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modalIn {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
  `,
})
export class Modal {
  @Input() open = false;
  @Input() title = '';
  @Input() closeOnBackdrop = true;
  @Output() closed = new EventEmitter<void>();

  dismiss() { this.closed.emit(); }

  onBackdropClick(_e: Event) {
    if (this.closeOnBackdrop) this.dismiss();
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.open) this.dismiss(); }
}
