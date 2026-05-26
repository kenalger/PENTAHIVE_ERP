import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../supabase.client';

@Component({
  selector: 'app-admin-users',
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
  styles: `
    .error { color: #c00; }
    .result { margin-top: 1.5rem; padding: 1rem; border: 1px solid #ccc; }
    code { background: #f4f4f4; padding: 2px 6px; font-size: 1.1em; }
  `,
})
export class Users {
  email = '';
  loading = signal(false);
  error = signal<string | null>(null);
  createdUser = signal<{ email: string; tempPassword: string } | null>(null);

  async onSubmit() {
    this.loading.set(true);
    this.error.set(null);
    this.createdUser.set(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      this.error.set('Not signed in.');
      this.loading.set(false);
      return;
    }

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
