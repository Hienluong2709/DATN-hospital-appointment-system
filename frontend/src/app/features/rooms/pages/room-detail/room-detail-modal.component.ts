import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Room } from '../../models/rooms.model';
import { getRoomStatusLabel } from '../../../../shared/enum-label.util';

@Component({
  selector: 'app-room-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './room-detail-modal.component.html',
  styleUrl: './room-detail-modal.component.scss'
})
export class RoomDetailModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isLoading = false;
  @Input() room: Room | null = null;

  @Output() closeModal = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }

  getRoomStatusLabel(status: string | null | undefined): string {
    return getRoomStatusLabel(status);
  }
}
