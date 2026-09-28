import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/features/auth/auth-client";
import type { OrderStatus } from "@/features/orders/types";
import { deleteJson, getJson, putJson, retryUnlessClientError as retry } from "@/lib/http";
import type { AccountOrdersPage, AccountSummary, SavedAddress } from "./types";

/** Unwraps better-auth client results, throwing their error so React Query sees it. */
async function unwrap<T>(promise: Promise<{ data: T | null; error: { message?: string } | null }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Something went wrong");
  return data as T;
}

export function useAccountSummary() {
  return useQuery({
    queryKey: ["account", "summary"],
    queryFn: () => getJson<AccountSummary>("/account/summary"),
    retry,
  });
}

export function useAccountOrders(filters: { status?: OrderStatus; page?: number }) {
  const search = new URLSearchParams();
  if (filters.status) search.set("status", filters.status);
  if (filters.page && filters.page > 1) search.set("page", String(filters.page));
  const qs = search.toString();
  return useQuery({
    queryKey: ["account", "orders", filters],
    queryFn: () => getJson<AccountOrdersPage>(`/account/orders${qs ? `?${qs}` : ""}`),
    retry,
    placeholderData: (previous) => previous,
  });
}

export function useSavedAddress(enabled = true) {
  return useQuery({
    queryKey: ["account", "address"],
    queryFn: () => getJson<SavedAddress | null>("/account/address"),
    enabled,
    retry,
  });
}

export function useSaveAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (address: SavedAddress) => putJson<SavedAddress>("/account/address", address),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account"] }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteJson("/account/address"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account"] }),
  });
}

// ── Profile & security (better-auth) ───────────────────────

export function useUpdateName() {
  return useMutation({ mutationFn: (name: string) => unwrap(authClient.updateUser({ name })) });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      // Signing out other devices is the safe default after a password change.
      unwrap(authClient.changePassword({ ...input, revokeOtherSessions: true })),
  });
}

export function useSignInMethods() {
  return useQuery({
    queryKey: ["account", "sign-in-methods"],
    queryFn: () => unwrap(authClient.listAccounts()),
  });
}

export function useDeviceSessions() {
  return useQuery({
    queryKey: ["account", "sessions"],
    queryFn: () => unwrap(authClient.listSessions()),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => unwrap(authClient.revokeSession({ token })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account", "sessions"] }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(authClient.revokeOtherSessions()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account", "sessions"] }),
  });
}
