import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-server-error',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="status-page">
      <h1>Server Error</h1>
      <p>The system is temporarily unavailable. Please try again later.</p>
      <a routerLink="/">Back to Home</a>
    </section>
  `,
  styles: ['.status-page { max-width: 720px; margin: 0 auto; padding: 3rem 1rem; }']
})
export class ServerErrorComponent {}
