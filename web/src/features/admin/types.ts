import type { Swatch } from "@/features/catalog/types";
import type {
  OrderAddress,
  OrderLine,
  OrderStatus,
  OrderTotals,
  PaymentStatus,
} from "@/features/orders/types";

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AdminOrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  shippingMethod: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  itemCount: number;
};

export type OrdersPage = Paged<AdminOrderRow> & {
  statusCounts: Partial<Record<OrderStatus, number>>;
};

export type Overview = {
  days: { date: string; revenueCents: number; orders: number }[];
  current: { revenueCents: number; orders: number };
  previous: { revenueCents: number; orders: number };
  statusCounts: Partial<Record<OrderStatus, number>>;
  customers: { total: number; new30: number };
  toShip: AdminOrderRow[];
  recent: AdminOrderRow[];
  lowStock: {
    sku: string;
    size: string;
    stock: number;
    productSlug: string;
    productName: string;
  }[];
  lowStockThreshold: number;
};

export type OrderEventType =
  | "created"
  | "paid"
  | "payment_failed"
  | "payment_cancelled"
  | "fulfilled"
  | "cancelled"
  | "note"
  | "tracking_updated";

export type OrderEvent = {
  id: number;
  type: OrderEventType;
  message: string | null;
  createdAt: string;
  actorName: string | null;
};

export type AdminOrder = Omit<AdminOrderRow, "itemCount"> &
  OrderAddress &
  OrderTotals & {
    phone: string;
    trackingNumber: string | null;
    shippedAt: string | null;
    items: (OrderLine & { id: number })[];
    payments: {
      id: string;
      provider: string;
      method: string;
      status: PaymentStatus;
      amountCents: number;
      reference: string;
      createdAt: string;
      completedAt: string | null;
    }[];
    events: OrderEvent[];
    customer: { id: string; name: string; email: string } | null;
    allowedTransitions: OrderStatus[];
  };

export type AdminProduct = {
  slug: string;
  name: string;
  description: string;
  collection: string;
  priceCents: number;
  currency: string;
  active: boolean;
  swatch: Swatch | null;
  imageUrl: string | null;
  variants: { size: string; sku: string; stock: number; priceCents: number | null }[];
};

export type ProductInput = {
  name: string;
  collection: string;
  description: string;
  color: string;
  fabric: string;
  fit: string;
  weight: string;
  care: string;
  priceCents: number;
  active: boolean;
  /** Fallback artwork when there are no photos. */
  swatch?: Swatch | null;
  /** In display order; the first is the cover. */
  images: { url: string; alt: string }[];
  /** priceCents null = the size uses the product's base price. */
  variants: { size: string; stock: number; priceCents: number | null }[];
};

export type AdminProductDetail = ProductInput & {
  slug: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  unitsSold: number;
  variants: { size: string; sku: string; stock: number; priceCents: number | null }[];
};

export type UserRole = "customer" | "admin";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
};

export type UsersPage = Paged<AdminUserRow> & {
  counts: { all: number; admins: number; banned: number };
};

export type AdminUser = AdminUserRow & {
  orders: AdminOrderRow[];
  sessions: {
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  }[];
  providers: string[];
  isSelf: boolean;
};

export type StoreSettings = {
  store: { name: string; supportEmail: string; phone: string; businessId: string };
  shipping: {
    options: Record<string, { enabled: boolean; priceCents: number }>;
    freeShippingThresholdCents: number | null;
  };
  payments: { enabledMethods: string[] };
  inventory: { lowStockThreshold: number };
};

export type SettingsSection = keyof StoreSettings;

export type SettingsResponse = {
  settings: StoreSettings;
  catalog: {
    shippingOptions: { id: string; name: string; description: string; priceCents: number }[];
    paymentMethods: { id: string; name: string; group: string }[];
  };
  paymentProvider: string;
};
