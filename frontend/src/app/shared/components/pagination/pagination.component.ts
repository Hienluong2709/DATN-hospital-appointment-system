import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-shared-pagination',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss'
})
export class SharedPaginationComponent {
  @Input() totalItems = 0;
  @Input() page = 1;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [10, 20, 50];

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  get safePage(): number {
    return Math.min(Math.max(this.page, 1), this.totalPages);
  }

  get startItem(): number {
    if (!this.totalItems) {
      return 0;
    }

    return (this.safePage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.safePage * this.pageSize, this.totalItems);
  }

  get visiblePages(): number[] {
    const maxVisible = 5;
    let start = Math.max(1, this.safePage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.safePage) {
      return;
    }

    this.pageChange.emit(page);
  }

  onPageSizeChanged(rawValue: string): void {
    const nextPageSize = Number(rawValue);
    if (!Number.isInteger(nextPageSize) || nextPageSize <= 0 || nextPageSize === this.pageSize) {
      return;
    }

    this.pageSizeChange.emit(nextPageSize);
  }
}
