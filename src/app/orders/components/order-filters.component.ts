import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { OrderStatus } from '../../core/models/order.model';

@Component({
  selector: 'app-order-filters',
  standalone: true,
  templateUrl: './order-filters.component.html',
  styleUrl: './order-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderFiltersComponent {
  @Input() searchTerm = '';
  @Input() statusFilter: 'ALL' | OrderStatus = 'ALL';

  @Output() searchChange = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<'ALL' | OrderStatus>();

  protected onStatusSelection(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'ALL' | OrderStatus;
    this.statusChange.emit(value);
  }
}
