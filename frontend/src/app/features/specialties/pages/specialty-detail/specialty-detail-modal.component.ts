import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Room } from '../../../rooms/models/rooms.model';
import { Specialty } from '../../models/specialties.model';

@Component({
  selector: 'app-specialty-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './specialty-detail-modal.component.html',
  styleUrl: './specialty-detail-modal.component.scss'
})
export class SpecialtyDetailModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input({ required: true }) isLoading = false;
  @Input() specialty: Specialty | null = null;
  @Input() rooms: Room[] = [];

  @Output() closeModal = new EventEmitter<void>();

  onOverlayClick(): void {
    this.closeModal.emit();
  }

  onCloseClick(): void {
    this.closeModal.emit();
  }
}
