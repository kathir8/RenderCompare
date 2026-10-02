import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { effect, inject, Injectable, makeStateKey, PLATFORM_ID, signal, TransferState } from '@angular/core';

export interface PerformanceSnapshot {
  ordersApiPageCount: number;
  latestUsersApiMs: number | null;
  latestProductsApiMs: number | null;
  firstOrdersApiPageMs: number | null;
  averageOrdersApiPageMs: number | null;
  latestOrdersApiPageMs: number | null;
  latestDetailsApiMs: number | null;
  csrReadyMs: number | null;
  ssrDataReadyMs: number | null;
  ssrServerRenderMs: number | null;
  hydrationReadyMs: number | null;
  ttfbMs: number | null;
  domInteractiveMs: number | null;
  domContentLoadedMs: number | null;
  firstPaintMs: number | null;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
  loadEventMs: number | null;
  jsTransferKb: number | null;
  cssTransferKb: number | null;
  documentTransferKb: number | null;
  documentHtmlKb: number | null;
  longTaskCount: number | null;
  longTaskTotalMs: number | null;
  totalOrders: number | null;
  currentBatchRows: number;
  pageSize: number;
}

const emptySnapshot: PerformanceSnapshot = {
  ordersApiPageCount: 0,
  latestUsersApiMs: null,
  latestProductsApiMs: null,
  firstOrdersApiPageMs: null,
  averageOrdersApiPageMs: null,
  latestOrdersApiPageMs: null,
  latestDetailsApiMs: null,
  csrReadyMs: null,
  ssrDataReadyMs: null,
  ssrServerRenderMs: null,
  hydrationReadyMs: null,
  ttfbMs: null,
  domInteractiveMs: null,
  domContentLoadedMs: null,
  firstPaintMs: null,
  firstContentfulPaintMs: null,
  largestContentfulPaintMs: null,
  loadEventMs: null,
  jsTransferKb: null,
  cssTransferKb: null,
  documentTransferKb: null,
  documentHtmlKb: null,
  longTaskCount: null,
  longTaskTotalMs: null,
  totalOrders: null,
  currentBatchRows: 0,
  pageSize: 0,
};

const SSR_PERFORMANCE_KEY = makeStateKey<PerformanceSnapshot | null>('ssr-performance-snapshot');

@Injectable({ providedIn: 'root' })
export class PerformanceLoggerService {
  private readonly transferState = inject(TransferState);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snapshotState = signal<PerformanceSnapshot>(emptySnapshot);
  private readonly csrSnapshotState = signal<PerformanceSnapshot | null>(null);
  private readonly ssrSnapshotState = signal<PerformanceSnapshot | null>(null);
  readonly snapshot = this.snapshotState.asReadonly();
  readonly csrSnapshot = this.csrSnapshotState.asReadonly();
  readonly ssrSnapshot = this.ssrSnapshotState.asReadonly();

  private readonly ordersApiSamples: number[] = [];
  private dashboardStartedAt: number | null = null;
  private shouldPersistCsrSnapshot = false;
  private paintObserver: PerformanceObserver | null = null;
  private lcpObserver: PerformanceObserver | null = null;
  private longTaskObserver: PerformanceObserver | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const storedCsrSnapshot = sessionStorage.getItem('csr-performance-snapshot');
        if (storedCsrSnapshot) {
          this.csrSnapshotState.set(JSON.parse(storedCsrSnapshot) as PerformanceSnapshot);
        }
      } catch {
      }

      const snapshot = this.transferState.get(SSR_PERFORMANCE_KEY, null);
      if (snapshot) {
        this.ssrSnapshotState.set(snapshot);
        this.transferState.remove(SSR_PERFORMANCE_KEY);
      }

      effect(() => {
        const snapshot = this.snapshotState();
        if (this.shouldPersistCsrSnapshot && snapshot.totalOrders !== null) {
          this.csrSnapshotState.set(snapshot);
          try {
            sessionStorage.setItem('csr-performance-snapshot', JSON.stringify(snapshot));
          } catch {
            // Session storage can be unavailable in restricted browser contexts.
          }
        }
      });
    }
  }

  beginCsrRun(): void {
    this.shouldPersistCsrSnapshot = true;
    this.dashboardStartedAt = performance.now();
    this.ordersApiSamples.length = 0;
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      ordersApiPageCount: 0,
      latestUsersApiMs: null,
      latestProductsApiMs: null,
      firstOrdersApiPageMs: null,
      averageOrdersApiPageMs: null,
      latestOrdersApiPageMs: null,
      latestDetailsApiMs: null,
      csrReadyMs: null,
      ssrDataReadyMs: null,
      ssrServerRenderMs: null,
      hydrationReadyMs: null,
      totalOrders: null,
      currentBatchRows: 0,
    }));
  }

  beginSsrRun(): void {
    this.shouldPersistCsrSnapshot = false;
    this.dashboardStartedAt = performance.now();
    this.ordersApiSamples.length = 0;
    this.snapshotState.set(emptySnapshot);
  }

  mark(label: string, details: Record<string, unknown> = {}): void {
    const payload = {
      label,
      timestamp: new Date().toISOString(),
      elapsedMs: performance.now(),
      ...details,
    };

    console.info('[Performance]', payload);
  }

  captureSnapshot(): Partial<PerformanceSnapshot> {
    const snapshot = this.navigationMetrics();
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const javascriptTransfer = this.transferSize(resources, /\.(?:m?js)$/i);
    const stylesheetTransfer = this.transferSize(resources, /\.css$/i);
    const serverRender = navigation?.serverTiming.find((entry) => entry.name === 'ssr');

    const resourceSnapshot = {
      jsTransferKb: javascriptTransfer === null ? null : javascriptTransfer / 1024,
      cssTransferKb: stylesheetTransfer === null ? null : stylesheetTransfer / 1024,
      documentTransferKb: navigation?.transferSize ? navigation.transferSize / 1024 : null,
      documentHtmlKb: navigation?.encodedBodySize ? navigation.encodedBodySize / 1024 : null,
      ssrServerRenderMs: serverRender?.duration ?? null,
    };

    this.snapshotState.update((current) => ({ ...current, ...snapshot, ...resourceSnapshot }));
    if (this.ssrSnapshotState()) {
      this.ssrSnapshotState.update((current) => current ? ({ ...current, ...snapshot, ...resourceSnapshot }) : current);
    }
    this.observePaintEntries();
    this.observeLargestContentfulPaint();
    this.observeLongTasks();
    this.scheduleNavigationRefresh();
    this.mark('Application metrics captured', { ...snapshot, ...resourceSnapshot });
    return { ...snapshot, ...resourceSnapshot };
  }

  recordUsersApi(durationMs: number): void {
    this.snapshotState.update((snapshot) => ({ ...snapshot, latestUsersApiMs: durationMs }));
  }

  recordProductsApi(durationMs: number): void {
    this.snapshotState.update((snapshot) => ({ ...snapshot, latestProductsApiMs: durationMs }));
  }

  recordOrdersApiPage(durationMs: number, skip: number, total: number, rows: number, pageSize: number): void {
    this.ordersApiSamples.push(durationMs);
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      ordersApiPageCount: this.ordersApiSamples.length,
      firstOrdersApiPageMs: skip === 0 && snapshot.firstOrdersApiPageMs === null ? durationMs : snapshot.firstOrdersApiPageMs,
      averageOrdersApiPageMs: this.ordersApiSamples.reduce((sum, duration) => sum + duration, 0) / this.ordersApiSamples.length,
      latestOrdersApiPageMs: durationMs,
      totalOrders: total,
      currentBatchRows: rows,
      pageSize,
    }));
  }

  recordDetailsApi(durationMs: number): void {
    this.snapshotState.update((snapshot) => ({ ...snapshot, latestDetailsApiMs: durationMs }));
  }

  recordSsrDataReady(): void {
    if (this.dashboardStartedAt !== null) {
      this.snapshotState.update((snapshot) => ({
        ...snapshot,
        ssrDataReadyMs: performance.now() - this.dashboardStartedAt!,
      }));
      this.dashboardStartedAt = null;
    }
    this.publishSsrSnapshot();
  }

  recordHydrationReady(): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      hydrationReadyMs: navigation ? performance.now() - navigation.startTime : null,
    }));
    if (this.ssrSnapshotState()) {
      this.ssrSnapshotState.update((snapshot) => snapshot
        ? { ...snapshot, hydrationReadyMs: this.snapshotState().hydrationReadyMs }
        : snapshot);
    }
  }

  publishSsrSnapshot(): void {
    if (isPlatformServer(this.platformId)) {
      const snapshot = this.snapshotState();
      this.ssrSnapshotState.set(snapshot);
      this.transferState.set(SSR_PERFORMANCE_KEY, snapshot);
    }
  }

  recordSsrServerRender(durationMs: number): void {
    this.snapshotState.update((snapshot) => ({ ...snapshot, ssrServerRenderMs: durationMs }));
    this.publishSsrSnapshot();
  }

  recordCsrReady(): void {
    if (this.dashboardStartedAt !== null) {
      this.snapshotState.update((snapshot) => ({
        ...snapshot,
        csrReadyMs: performance.now() - this.dashboardStartedAt!,
      }));
      this.dashboardStartedAt = null;
    }
  }

  private transferSize(resources: PerformanceResourceTiming[], pattern: RegExp): number | null {
    const matchingResources = resources.filter((entry) => pattern.test(new URL(entry.name).pathname));
    const encodedBytes = matchingResources.reduce((total, entry) => total + entry.encodedBodySize, 0);
    return encodedBytes > 0 ? encodedBytes : null;
  }

  private navigationMetrics(): Partial<PerformanceSnapshot> {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint');

    return {
      ttfbMs: navigation?.responseStart ? navigation.responseStart - navigation.requestStart : null,
      domInteractiveMs: navigation?.domInteractive ? navigation.domInteractive - navigation.startTime : null,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd
        ? navigation.domContentLoadedEventEnd - navigation.startTime
        : null,
      firstPaintMs: this.findPaintEntry(paints, 'first-paint'),
      firstContentfulPaintMs: this.findPaintEntry(paints, 'first-contentful-paint'),
      loadEventMs: navigation?.loadEventEnd ? navigation.loadEventEnd - navigation.startTime : null,
    };
  }

  private readonly refreshNavigationMetrics = (): void => {
    const updates = this.navigationMetrics();
    this.snapshotState.update((snapshot) => ({ ...snapshot, ...updates }));
    this.updateSsrSnapshot(updates);
  };

  private updateSsrSnapshot(updates: Partial<PerformanceSnapshot>): void {
    if (this.ssrSnapshotState()) {
      this.ssrSnapshotState.update((snapshot) => snapshot ? { ...snapshot, ...updates } : snapshot);
    }
  }

  private scheduleNavigationRefresh(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this.refreshNavigationMetrics, { once: true });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('load', this.refreshNavigationMetrics, { once: true });
      window.requestAnimationFrame(() => window.requestAnimationFrame(this.refreshNavigationMetrics));
    }
  }

  private observePaintEntries(): void {
    if (this.paintObserver || typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      this.paintObserver = new PerformanceObserver((list) => {
        const updates: Partial<PerformanceSnapshot> = {};
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint') {
            updates.firstPaintMs = entry.startTime;
          } else if (entry.name === 'first-contentful-paint') {
            updates.firstContentfulPaintMs = entry.startTime;
          }
        }
        this.snapshotState.update((snapshot) => ({ ...snapshot, ...updates }));
        this.updateSsrSnapshot(updates);
      });
      this.paintObserver.observe({ type: 'paint', buffered: true });
    } catch {
      this.paintObserver = null;
    }
  }

  private observeLargestContentfulPaint(): void {
    if (this.lcpObserver || typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      this.lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries[entries.length - 1];
        if (latest) {
          const update = { largestContentfulPaintMs: latest.startTime };
          this.snapshotState.update((snapshot) => ({ ...snapshot, ...update }));
          this.updateSsrSnapshot(update);
        }
      });
      this.lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      this.lcpObserver = null;
    }
  }

  private observeLongTasks(): void {
    if (this.longTaskObserver || typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const snapshot = this.snapshotState();
        const update = {
          ...snapshot,
          longTaskCount: (snapshot.longTaskCount ?? 0) + entries.length,
          longTaskTotalMs: (snapshot.longTaskTotalMs ?? 0) + entries.reduce((sum, entry) => sum + entry.duration, 0),
        };
        this.snapshotState.set(update);
        this.updateSsrSnapshot({
          longTaskCount: update.longTaskCount,
          longTaskTotalMs: update.longTaskTotalMs,
        });
      });
      this.longTaskObserver.observe({ type: 'longtask', buffered: true });
      this.snapshotState.update((snapshot) => ({ ...snapshot, longTaskCount: 0, longTaskTotalMs: 0 }));
    } catch {
      this.longTaskObserver = null;
    }
  }

  private findPaintEntry(entries: PerformanceEntryList, name: string): number | null {
    const entry = entries.find((item) => item.name === name);
    return entry ? entry.startTime : null;
  }
}
