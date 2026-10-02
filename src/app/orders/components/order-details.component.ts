import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { OrderDetailViewModel } from '../../core/models/order.model';

@Component({
  selector: 'app-order-details',
  standalone: true,
  imports: [DatePipe, CurrencyPipe],
  templateUrl: './order-details.component.html',
  styleUrl: './order-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailsComponent {
  @Input() order: OrderDetailViewModel | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;

  protected statusClass(status: string): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }
}
