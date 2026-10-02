import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { GridDataResult, GridModule, PageChangeEvent, SelectionEvent } from '@progress/kendo-angular-grid';
import { process, SortDescriptor } from '@progress/kendo-data-query';
import { OrderSummary } from '../../core/models/order.model';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [GridModule],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent {
  @Input() orders: OrderSummary[] = [];
  @Input() total = 0;
  @Input() selectedOrderId: string | null = null;
  @Input() sort: SortDescriptor[] = [];
  @Input() skip = 0;
  @Input() loading = false;

  @Output() orderSelected = new EventEmitter<OrderSummary>();
  @Output() sortChange = new EventEmitter<SortDescriptor[]>();
  @Output() pageChange = new EventEmitter<number>();

  protected readonly pageSize = 40;

  protected get gridData(): GridDataResult {
    return {
      data: process(this.orders, { sort: this.sort }).data as OrderSummary[],
      total: this.total,
    };
  }

  protected onPageChange(event: PageChangeEvent): void {
    this.pageChange.emit(event.skip);
  }

  protected onSortChange(sort: SortDescriptor[]): void {
    this.skip = 0;
    this.sortChange.emit(sort);
  }

  protected onSelectionChange(event: SelectionEvent): void {
    const selected = event.selectedRows?.[0]?.dataItem as OrderSummary | null | undefined;
    if (selected) {
      this.orderSelected.emit(selected);
    }
  }

  protected statusClass(status: string): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }
}
