import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-home',
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
  styles: ``,
})
export class Home {
  auth = inject(AuthService);
  private router = inject(Router);

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
