import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="status-page">
      <h1>Access Denied</h1>
      <p>You do not have permission to access this resource.</p>
      <a routerLink="/login">Go to Login</a>
    </section>
  `,
  styles: ['.status-page { max-width: 720px; margin: 0 auto; padding: 3rem 1rem; }']
})
export class AccessDeniedComponent {}
