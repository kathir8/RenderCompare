import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { OrderDetailViewModel, OrderItem, OrderPriority, OrderStatus, OrderSummary } from '../../core/models/order.model';
import { PerformanceLoggerService } from '../../core/services/performance.service';

interface DummyUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  university?: string;
  company?: { title?: string };
}

interface DummyUsersResponse {
  users: DummyUser[];
  total: number;
}

interface DummyProduct {
  id: number;
  title: string;
  category: string;
  price: number;
}

interface DummyProductsResponse {
  products: DummyProduct[];
}

export interface OrderPage {
  orders: OrderSummary[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class OrderDataService {
  private readonly departments = ['Cardiology', 'Neurology', 'Orthopedics', 'Radiology', 'Oncology', 'Pulmonology'];
  private readonly orderTypes = ['Laboratory', 'Imaging', 'Pharmacy', 'Consultation', 'Procedure'];

  constructor(
    private readonly http: HttpClient,
    private readonly performance: PerformanceLoggerService,
  ) {}

  loadOrderPage(skip: number, take: number): Observable<OrderPage> {
    this.performance.mark('Orders API page started', { skip, take });
    const userUrl = (offset: number) => `https://dummyjson.com/users?limit=${take}&skip=${offset}`;
    const requestStartedAt = performance.now();
    const loadUsers = (offset: number) => {
      const startedAt = performance.now();
      return this.http.get<DummyUsersResponse>(userUrl(offset)).pipe(
        tap(() => this.performance.recordUsersApi(performance.now() - startedAt)),
      );
    };

    return loadUsers(skip).pipe(
      switchMap((users) =>
        users.users.length > 0
          ? of(users)
          : loadUsers(skip % users.total),
      ),
      switchMap((users) => {
        const startedAt = performance.now();
        return this.http.get<DummyProductsResponse>('https://dummyjson.com/products?limit=30').pipe(
          tap(() => this.performance.recordProductsApi(performance.now() - startedAt)),
          map((products) => ({ users, products })),
        );
      }),
      tap(() => this.performance.recordOrdersApiPage(performance.now() - requestStartedAt, skip, 500, Math.min(take, 500 - skip), take)),
      map(({ users, products }) => ({
        orders: this.buildOrderPage(users.users, products.products, skip, take),
        total: 500,
      })),
      tap(({ orders, total }) => {
        this.performance.mark('Orders API page completed', { count: orders.length, total, skip });
      }),
    );
  }

  loadOrderDetails(order: OrderSummary): Observable<OrderDetailViewModel> {
    const requestStartedAt = performance.now();

    return forkJoin({
      patient: this.http.get<DummyUser>(`https://dummyjson.com/users/${order.patientId}`),
      doctor: this.http.get<DummyUser>(`https://dummyjson.com/users/${order.doctorId}`),
    }).pipe(
      tap(() => this.performance.recordDetailsApi(performance.now() - requestStartedAt)),
      map(({ patient, doctor }) => ({
        ...order,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        doctorSpecialty: doctor.university ?? 'Internal Medicine',
        ageInDays: this.calculateAgeInDays(order.createdAt),
        orderItems: order.items.map((item) => ({
          ...item,
          status: this.resolveItemStatus(item.name, order.status),
        })),
      })),
      tap((detail) => this.performance.mark('Order details loaded', { orderId: detail.id })),
    );
  }

  private buildOrderPage(users: DummyUser[], products: DummyProduct[], skip: number, take: number): OrderSummary[] {
    const orders: OrderSummary[] = [];

    for (let offset = 0; offset < Math.min(take, 500 - skip); offset++) {
      const index = skip + offset + 1;
      const patient = users[offset % users.length];
      const doctor = users[(offset * 3 + 1) % users.length];
      const department = this.departments[(index - 1) % this.departments.length];
      const orderType = this.orderTypes[(index - 1) % this.orderTypes.length];
      const status = this.resolveOrderStatus(index, orderType);
      const items = this.buildItems(products, index, orderType);
      const createdAt = new Date(Date.now() - index * 1000 * 60 * 60 * 12 * 2.3).toISOString();
      const amount = Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2));

      orders.push({
        id: `ORD-${10000 + index}`,
        patientId: patient.id,
        doctorId: doctor.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        department,
        orderType,
        priority: this.resolvePriority(status, orderType),
        status,
        createdAt,
        amount,
        ageInDays: this.calculateAgeInDays(createdAt),
        items,
      });
    }

    return orders;
  }

  private buildItems(products: DummyProduct[], index: number, orderType: string): OrderItem[] {
    const selectedProducts = products.slice(index % 5, (index % 5) + 5);

    return selectedProducts.map((product, itemIndex) => {
      const quantity = (index + itemIndex) % 4 + 1;
      const amount = Number((product.price * quantity * 1.15).toFixed(2));
      const status = this.resolveItemStatus(product.title, this.resolveOrderStatus(index + itemIndex, orderType));

      return {
        name: product.title,
        category: product.category,
        quantity,
        amount,
        status,
      };
    });
  }

  private resolveOrderStatus(index: number, orderType: string): OrderStatus {
    const mod = index % 10;

    if (mod === 0) return 'Cancelled';
    if (mod === 1 || mod === 2) return 'Pending';
    if (mod === 3 || mod === 4) return 'In Progress';
    if (mod === 5 || mod === 6) return 'Completed';
    if (orderType === 'Consultation' && mod === 7) return 'Review Required';

    return 'Review Required';
  }

  private resolvePriority(status: OrderStatus, orderType: string): OrderPriority {
    if (status === 'Cancelled') return 'Low';
    if (status === 'Review Required' || orderType === 'Procedure') return 'High';
    if (status === 'In Progress' || orderType === 'Imaging') return 'Medium';
    return 'Low';
  }

  private calculateAgeInDays(dateString: string): number {
    const createdAt = new Date(dateString).getTime();
    const now = Date.now();
    return Math.max(1, Math.round((now - createdAt) / (1000 * 60 * 60 * 24)));
  }

  private resolveItemStatus(name: string, status: OrderStatus): string {
    const normalized = name.toLowerCase();
    if (normalized.includes('blood') || normalized.includes('cbc') || normalized.includes('vitamin')) {
      return status === 'Cancelled' ? 'Cancelled' : 'Completed';
    }
    if (normalized.includes('x-ray') || normalized.includes('scan') || normalized.includes('echo')) {
      return status === 'Completed' ? 'Completed' : 'Pending';
    }
    return status === 'In Progress' ? 'Processing' : status === 'Completed' ? 'Completed' : 'Pending';
  }
}
