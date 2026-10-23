import type { OrderStatus } from "@/features/orders/types";

export type AccountOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  shippedAt: string | null;
  trackingNumber: string | null;
  itemCount: number;
  firstItem: string | null;
};

export type SavedAddress = {
  firstName: string;
  lastName: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country?: string;
};

export type AccountSummary = {
  orders: number;
  spentCents: number;
  inTransit: number;
  memberSince: string;
  recent: AccountOrder[];
  address: SavedAddress | null;
};

export type AccountOrdersPage = {
  rows: AccountOrder[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  statusCounts: Partial<Record<OrderStatus, number>>;
};
