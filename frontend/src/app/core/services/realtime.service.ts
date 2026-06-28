import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';

export type RealtimeEventType = 'connection.ready' | 'queue.updated' | 'queue.forecast.updated';

export interface RealtimeEventPayload {
  reason?: string;
  role?: string;
  appointment_id?: number | null;
  queue_id?: number | null;
  doctor_id?: number | null;
  patient_id?: number | null;
  patient_ids?: number[];
  date?: string | null;
  status?: string | null;
  emitted_at?: string;
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: RealtimeEventPayload;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private static readonly RECONNECT_DELAY_MS = 5000;

  private readonly tokenService = inject(TokenService);
  private readonly zone = inject(NgZone);
  private readonly eventSubject = new Subject<RealtimeEvent>();

  private socket: WebSocket | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  readonly events$: Observable<RealtimeEvent> = this.eventSubject.asObservable();

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const accessToken = this.tokenService.getAccessToken();
    if (!accessToken) {
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();

    const url = new URL(environment.realtimeWsUrl);
    url.searchParams.set('access_token', accessToken);

    this.zone.runOutsideAngular(() => {
      this.socket = new WebSocket(url.toString());

      this.socket.onmessage = (message) => {
        this.handleMessage(message.data);
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.socket?.close();
      };
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.eventSubject.complete();
  }

  private handleMessage(rawMessage: string): void {
    try {
      const parsed = JSON.parse(rawMessage) as RealtimeEvent;
      if (!parsed?.type || !parsed.payload) {
        return;
      }

      this.zone.run(() => {
        this.eventSubject.next(parsed);
      });
    } catch {
      // Ignore malformed socket messages.
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.tokenService.hasValidSession()) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, RealtimeService.RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
}
