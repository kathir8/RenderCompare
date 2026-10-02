export type OrderPriority = 'High' | 'Medium' | 'Low';
export type OrderStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled' | 'Review Required';
export type SortKey = 'orderId' | 'patient' | 'status' | 'createdAt' | 'priority';

export interface OrderItem {
  name: string;
  category: string;
  quantity: number;
  amount: number;
  status: string;
}

export interface OrderSummary {
  id: string;
  patientId: number;
  doctorId: number;
  patientName: string;
  doctorName: string;
  department: string;
  orderType: string;
  priority: OrderPriority;
  status: OrderStatus;
  createdAt: string;
  amount: number;
  ageInDays: number;
  items: OrderItem[];
}

export interface OrderDetailViewModel extends OrderSummary {
  patientEmail: string;
  patientPhone: string;
  doctorSpecialty: string;
  orderItems: OrderItem[];
}
