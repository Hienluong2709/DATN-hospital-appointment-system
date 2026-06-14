import { Component } from '@angular/core';

@Component({
  selector: 'app-equeue-numbers-page',
  standalone: true,
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <h1 class="feature-title">Số thứ tự điện tử</h1>
        <p class="feature-subtitle">Cấp phát số thứ tự điện tử và theo dõi luồng tiếp nhận theo từng quầy.</p>
      </header>

      <article class="feature-card">
        Module đã sẵn sàng để tích hợp API và hoàn thiện giao diện.
      </article>
    </section>
  `
})
export class EQueueNumbersPageComponent {}
