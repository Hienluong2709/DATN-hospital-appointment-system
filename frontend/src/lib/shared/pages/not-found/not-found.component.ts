import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="status-page">
      <h1>404</h1>
      <p>Page not found.</p>
      <a routerLink="/">Back to Home</a>
    </section>
  `,
  styles: ['.status-page { max-width: 720px; margin: 0 auto; padding: 3rem 1rem; }']
})
export class NotFoundComponent {}
