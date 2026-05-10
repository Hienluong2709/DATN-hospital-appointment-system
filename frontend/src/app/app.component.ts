import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IdleSessionService } from './core/services/idle-session.service';
import { NotificationService } from './core/services/notification.service';
import { NotificationModalComponent } from './shared/components/notification-modal/notification-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly idleSessionService = inject(IdleSessionService);
  protected readonly notificationService = inject(NotificationService);

  constructor() {
    this.idleSessionService.startMonitoring();
  }
}
