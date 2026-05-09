import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IdleSessionService } from './core/services/idle-session.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly idleSessionService = inject(IdleSessionService);

  constructor() {
    this.idleSessionService.startMonitoring();
  }
}
