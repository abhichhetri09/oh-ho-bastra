import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OrderStatus } from "@/features/orders/types";
import {
  getJson,
  patchJson,
  postJson,
  putJson,
  retryUnlessClientError as retry,
} from "@/lib/http";
import type {
  AdminOrder,
  AdminProduct,
  AdminProductDetail,
  ProductInput,
  AdminUser,
  OrdersPage,
  Overview,
  SettingsResponse,
  SettingsSection,
  StoreSettings,
  UserRole,
  UsersPage,
} from "./types";

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

/** Invalidates every admin view plus the storefront data an admin change can affect. */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["admin", "products", "collections", "orders", "checkout-options"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

// ── Dashboard ──────────────────────────────────────────────

export function useOverview() {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => getJson<Overview>("/admin/overview"),
    retry,
  });
}

// ── Orders ─────────────────────────────────────────────────

export type OrderFilters = { status?: OrderStatus; q?: string; page?: number };

export function useAdminOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => getJson<OrdersPage>(`/admin/orders${query(filters)}`),
    retry,
    placeholderData: (previous) => previous,
  });
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "order", id],
    queryFn: () => getJson<AdminOrder>(`/admin/orders/${id}`),
    enabled: Boolean(id),
    retry,
  });
}

export function useSetOrderStatus(id: string) {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (body: { status: OrderStatus; trackingNumber?: string; reason?: string }) =>
      patchJson(`/admin/orders/${id}`, body),
    onSuccess,
  });
}

export function useSetTracking(id: string) {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (trackingNumber: string) => putJson(`/admin/orders/${id}/tracking`, { trackingNumber }),
    onSuccess,
  });
}

export function useAddOrderNote(id: string) {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (message: string) => postJson(`/admin/orders/${id}/notes`, { message }),
    onSuccess,
  });
}

// ── Products ───────────────────────────────────────────────

export function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => getJson<AdminProduct[]>("/admin/products"),
    retry,
  });
}

export function useAdminProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ["admin", "product", slug],
    queryFn: () => getJson<AdminProductDetail>(`/admin/products/${slug}`),
    enabled: Boolean(slug),
    retry,
  });
}

/** Uploads one image file; resolves to its URL under /api/uploads. */
export async function uploadImage(file: File) {
  const res = await fetch("/api/v1/admin/uploads", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `Could not upload ${file.name}`);
  return body.url;
}

export function useCreateProduct() {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (input: ProductInput & { slug?: string }) => postJson<{ slug: string }>("/admin/products", input),
    onSuccess,
  });
}

export function useSaveProduct(slug: string) {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (input: ProductInput) => putJson<{ slug: string }>(`/admin/products/${slug}`, input),
    onSuccess,
  });
}

export function useUpdateProduct() {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: ({
      slug,
      ...patch
    }: { slug: string } & Partial<Pick<AdminProduct, "name" | "description" | "priceCents" | "active">>) =>
      patchJson(`/admin/products/${slug}`, patch),
    onSuccess,
  });
}

export function useSetStock() {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: ({ sku, stock }: { sku: string; stock: number }) =>
      patchJson(`/admin/variants/${sku}`, { stock }),
    onSuccess,
  });
}

// ── Customers ──────────────────────────────────────────────

export type UserFilters = { q?: string; role?: UserRole; status?: "active" | "banned"; page?: number };

export function useAdminUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ["admin", "users", filters],
    queryFn: () => getJson<UsersPage>(`/admin/users${query(filters)}`),
    retry,
    placeholderData: (previous) => previous,
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => getJson<AdminUser>(`/admin/users/${id}`),
    enabled: Boolean(id),
    retry,
  });
}

/** Role, ban, unban and sign-out-everywhere actions for one user. */
export function useUserActions(id: string) {
  const onSuccess = useRefreshAll();
  const base = `/admin/users/${id}`;
  return {
    setRole: useMutation({
      mutationFn: (role: UserRole) => postJson(`${base}/role`, { role }),
      onSuccess,
    }),
    ban: useMutation({
      mutationFn: (body: { reason?: string; days?: number }) => postJson(`${base}/ban`, body),
      onSuccess,
    }),
    unban: useMutation({ mutationFn: () => postJson(`${base}/unban`, {}), onSuccess }),
    revokeSessions: useMutation({
      mutationFn: () => postJson(`${base}/revoke-sessions`, {}),
      onSuccess,
    }),
  };
}

// ── Settings ───────────────────────────────────────────────

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => getJson<SettingsResponse>("/admin/settings"),
    retry,
  });
}

export function useSaveSettings<K extends SettingsSection>(section: K) {
  const onSuccess = useRefreshAll();
  return useMutation({
    mutationFn: (value: StoreSettings[K]) => putJson(`/admin/settings/${section}`, value),
    onSuccess,
  });
}
