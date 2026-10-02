import { afterNextRender, Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { SortDescriptor } from '@progress/kendo-data-query';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs';
import { OrderDetailViewModel, OrderStatus, OrderSummary } from './core/models/order.model';
import { PerformanceLoggerService } from './core/services/performance.service';
import { OrderFiltersComponent } from './orders/components/order-filters.component';
import { OrderListComponent } from './orders/components/order-list.component';
import { OrderDetailsComponent } from './orders/components/order-details.component';
import { OrderDataService } from './orders/services/order-data.service';

type StatusFilter = 'ALL' | OrderStatus;

interface PerformanceComparisonRow {
  metric: string;
  csrValue: string;
  ssrValue: string;
  unit: string;
}

@Component({
  selector: 'app-csr-dashboard',
  standalone: true,
  imports: [OrderFiltersComponent, OrderListComponent, OrderDetailsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly searchSubject = new Subject<string>();
  private readonly selectionSubject = new Subject<OrderSummary>();
  private readonly gridPageSubject = new Subject<number>();
  private readonly destroy$ = new Subject<void>();
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private uiReadyRecorded = false;

  protected readonly isSsrMode = this.route.snapshot.data['renderingMode'] === 'SSR';

  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly gridLoading = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly totalOrders = signal(0);
  protected readonly gridSkip = signal(0);
  protected readonly gridPageSize = 40;

  protected readonly selectedOrderId = signal<string | null>(null);
  protected readonly selectedOrder = signal<OrderDetailViewModel | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);

  protected readonly searchTerm = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly gridSort = signal<SortDescriptor[]>([]);

  protected get performanceRows(): PerformanceComparisonRow[] {
    const csrMetrics = this.isSsrMode
      ? this.performance.csrSnapshot()
      : this.performance.snapshot();
    const ssrMetrics = this.isSsrMode
      ? this.performance.ssrSnapshot() ?? (isPlatformServer(this.platformId) ? this.performance.snapshot() : null)
      : null;
    const csr = (value: number | null, digits = 1) => this.formatMetric(value ?? null, digits);
    const ssr = (value: number | null, digits = 1) => this.formatMetric(value ?? null, digits);

    return [
      { metric: 'Initial orders API page', csrValue: csr(csrMetrics?.firstOrdersApiPageMs ?? null), ssrValue: ssr(ssrMetrics?.firstOrdersApiPageMs ?? null), unit: 'ms' },
      { metric: 'Average orders API page', csrValue: csr(csrMetrics?.averageOrdersApiPageMs ?? null), ssrValue: ssr(ssrMetrics?.averageOrdersApiPageMs ?? null), unit: 'ms' },
      { metric: 'Latest orders API page', csrValue: csr(csrMetrics?.latestOrdersApiPageMs ?? null), ssrValue: ssr(ssrMetrics?.latestOrdersApiPageMs ?? null), unit: 'ms' },
      { metric: 'Users endpoint', csrValue: csr(csrMetrics?.latestUsersApiMs ?? null), ssrValue: ssr(ssrMetrics?.latestUsersApiMs ?? null), unit: 'ms' },
      { metric: 'Products endpoint', csrValue: csr(csrMetrics?.latestProductsApiMs ?? null), ssrValue: ssr(ssrMetrics?.latestProductsApiMs ?? null), unit: 'ms' },
      { metric: 'Orders API page requests', csrValue: csr(csrMetrics?.ordersApiPageCount ?? null, 0), ssrValue: ssr(ssrMetrics?.ordersApiPageCount ?? null, 0), unit: 'requests' },
      { metric: 'Latest order-details API request', csrValue: csr(csrMetrics?.latestDetailsApiMs ?? null), ssrValue: ssr(ssrMetrics?.latestDetailsApiMs ?? null), unit: 'ms' },
      { metric: 'CSR route to first data render', csrValue: csr(csrMetrics?.csrReadyMs ?? null), ssrValue: 'Not applicable', unit: 'ms' },
      { metric: 'SSR server data ready', csrValue: 'Not applicable', ssrValue: ssr(ssrMetrics?.ssrDataReadyMs ?? null), unit: 'ms' },
      {
        metric: 'SSR server render',
        csrValue: 'Not applicable',
        ssrValue: this.isSsrMode && isPlatformServer(this.platformId) && ssrMetrics?.ssrServerRenderMs === null
          ? 'SSR_RENDER_DURATION_PLACEHOLDER'
          : ssr(ssrMetrics?.ssrServerRenderMs ?? null),
        unit: 'ms',
      },
      { metric: 'Time to first byte', csrValue: csr(csrMetrics?.ttfbMs ?? null), ssrValue: ssr(ssrMetrics?.ttfbMs ?? null), unit: 'ms' },
      { metric: 'DOM interactive', csrValue: csr(csrMetrics?.domInteractiveMs ?? null), ssrValue: ssr(ssrMetrics?.domInteractiveMs ?? null), unit: 'ms' },
      { metric: 'DOMContentLoaded', csrValue: csr(csrMetrics?.domContentLoadedMs ?? null), ssrValue: ssr(ssrMetrics?.domContentLoadedMs ?? null), unit: 'ms' },
      { metric: 'First paint', csrValue: csr(csrMetrics?.firstPaintMs ?? null), ssrValue: ssr(ssrMetrics?.firstPaintMs ?? null), unit: 'ms' },
      { metric: 'First Contentful Paint', csrValue: csr(csrMetrics?.firstContentfulPaintMs ?? null), ssrValue: ssr(ssrMetrics?.firstContentfulPaintMs ?? null), unit: 'ms' },
      { metric: 'Largest Contentful Paint', csrValue: csr(csrMetrics?.largestContentfulPaintMs ?? null), ssrValue: ssr(ssrMetrics?.largestContentfulPaintMs ?? null), unit: 'ms' },
      { metric: 'Window load event', csrValue: csr(csrMetrics?.loadEventMs ?? null), ssrValue: ssr(ssrMetrics?.loadEventMs ?? null), unit: 'ms' },
      { metric: 'Hydration ready', csrValue: 'Not applicable', ssrValue: ssr(ssrMetrics?.hydrationReadyMs ?? null), unit: 'ms' },
      { metric: 'Document transfer size', csrValue: csr(csrMetrics?.documentTransferKb ?? null), ssrValue: ssr(ssrMetrics?.documentTransferKb ?? null), unit: 'KB' },
      { metric: 'HTML response size', csrValue: csr(csrMetrics?.documentHtmlKb ?? null), ssrValue: ssr(ssrMetrics?.documentHtmlKb ?? null), unit: 'KB' },
      { metric: 'JavaScript transfer size (encoded)', csrValue: csr(csrMetrics?.jsTransferKb ?? null), ssrValue: ssr(ssrMetrics?.jsTransferKb ?? null), unit: 'KB' },
      { metric: 'CSS transfer size (encoded)', csrValue: csr(csrMetrics?.cssTransferKb ?? null), ssrValue: ssr(ssrMetrics?.cssTransferKb ?? null), unit: 'KB' },
      { metric: 'Long tasks', csrValue: csr(csrMetrics?.longTaskCount ?? null, 0), ssrValue: ssr(ssrMetrics?.longTaskCount ?? null, 0), unit: 'tasks' },
      { metric: 'Total long-task duration', csrValue: csr(csrMetrics?.longTaskTotalMs ?? null), ssrValue: ssr(ssrMetrics?.longTaskTotalMs ?? null), unit: 'ms' },
      { metric: 'Order dataset', csrValue: csr(csrMetrics?.totalOrders ?? null, 0), ssrValue: ssr(ssrMetrics?.totalOrders ?? null, 0), unit: 'records' },
      { metric: 'Current API batch', csrValue: csr(csrMetrics?.currentBatchRows ?? null, 0), ssrValue: ssr(ssrMetrics?.currentBatchRows ?? null, 0), unit: 'records' },
      { metric: 'Virtual page size', csrValue: csr(csrMetrics?.pageSize ?? null, 0), ssrValue: ssr(ssrMetrics?.pageSize ?? null, 0), unit: 'records' },
    ];
  }

  protected readonly filteredOrders = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const currentStatus = this.statusFilter();

    const filtered = this.orders().filter((order) => {
      const matchesSearch =
        !query ||
        order.id.toLowerCase().includes(query) ||
        order.patientName.toLowerCase().includes(query) ||
        order.doctorName.toLowerCase().includes(query);

      const matchesStatus = currentStatus === 'ALL' || order.status === currentStatus;
      return matchesSearch && matchesStatus;
    });

    return filtered;
  });

  constructor(
    private readonly orderDataService: OrderDataService,
    private readonly performance: PerformanceLoggerService,
  ) {
    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {
        this.searchTerm.set(value);
        this.reloadFirstPage();
      });

    this.gridPageSubject
      .pipe(
        debounceTime(40),
        switchMap((skip) => {
          this.gridLoading.set(true);
          return this.orderDataService.loadOrderPage(skip, this.gridPageSize).pipe(
            map((page) => ({ ...page, skip })),
            catchError((error) => {
              this.listError.set('Unable to load orders.');
              this.loading.set(false);
              console.error('Orders API failed', error);
              return EMPTY;
            }),
            finalize(() => this.gridLoading.set(false)),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(({ orders, total, skip }) => {
        this.orders.set(orders);
        this.totalOrders.set(total);
        this.gridSkip.set(skip);
        this.loading.set(false);
        this.performance.mark('Orders rendered', { count: orders.length, total, skip });

        if (skip === 0 && !this.uiReadyRecorded) {
          this.uiReadyRecorded = true;
          if (this.isSsrMode && isPlatformServer(this.platformId)) {
            this.performance.recordSsrDataReady();
          } else if (this.isSsrMode && isPlatformBrowser(this.platformId)) {
            afterNextRender(() => this.performance.recordHydrationReady(), { injector: this.injector });
          } else if (isPlatformBrowser(this.platformId)) {
            afterNextRender(() => this.performance.recordCsrReady(), { injector: this.injector });
          }
        }

        if (skip === 0 && orders.length > 0 && !this.selectedOrderId()) {
          this.onSelectOrder(orders[0]);
        }
      });

    this.selectionSubject
      .pipe(
        switchMap((order) =>
          this.orderDataService.loadOrderDetails(order).pipe(
            catchError(() => {
              this.detailError.set('Unable to load order details. Please retry.');
              return EMPTY;
            }),
            finalize(() => this.detailLoading.set(false)),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((detail) => {
        this.selectedOrder.set(detail);
        this.performance.mark('Order details displayed', { orderId: detail.id });
        if (this.isSsrMode && isPlatformServer(this.platformId)) {
          this.performance.publishSsrSnapshot();
        }
      });
  }

  ngOnInit(): void {
    if (this.isSsrMode && isPlatformServer(this.platformId)) {
      this.performance.beginSsrRun();
    } else if (!this.isSsrMode && isPlatformBrowser(this.platformId)) {
      this.performance.beginCsrRun();
    }

    this.performance.mark(`${this.isSsrMode ? 'SSR' : 'CSR'} application bootstrap started`);
    if (isPlatformBrowser(this.platformId)) {
      this.performance.captureSnapshot();
    }
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  protected onStatusChange(value: StatusFilter): void {
    this.statusFilter.set(value);
    this.reloadFirstPage();
  }

  protected onGridSort(value: SortDescriptor[]): void {
    this.gridSort.set(value);
  }

  protected onGridPageChange(skip: number): void {
    if (skip === this.gridSkip()) {
      return;
    }

    this.gridSkip.set(skip);
    this.gridPageSubject.next(skip);
  }

  protected onSelectOrder(order: OrderSummary): void {
    this.selectedOrderId.set(order.id);
    this.selectedOrder.set(null);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.selectionSubject.next(order);
  }

  protected loadOrders(): void {
    this.loading.set(true);
    this.listError.set(null);
    this.gridSkip.set(0);
    this.gridPageSubject.next(0);
  }

  private reloadFirstPage(): void {
    this.gridSkip.set(0);
    this.gridPageSubject.next(0);
  }

  private formatMetric(value: number | null, fractionDigits = 1): string {
    return value === null ? '—' : value.toFixed(fractionDigits);
  }
}

