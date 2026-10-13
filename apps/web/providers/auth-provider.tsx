"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { PublicUser } from "@repo/types";
import { getMe } from "@/lib/api/client";
import { hasLoggedInCookie } from "@/lib/auth/cookies";
import { onSessionExpired } from "@/lib/auth/events";
import { createAuthStore, type AuthState, type AuthStore } from "@/store/auth";

const AuthStoreContext = createContext<AuthStore | null>(null);

/**
 * Seeds the auth store with the user the server read from the access token.
 * When that token has expired but the is_logged_in cookie says a session
 * exists, asks /auth/me, which refreshes the session through the axios
 * interceptor.
 */
export function AuthProvider({
  user,
  children,
}: {
  user: PublicUser | null;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createAuthStore(user));

  useEffect(() => {
    const { setUser } = store.getState();
    if (user) {
      setUser(user);
      return;
    }
    if (!hasLoggedInCookie()) {
      setUser(null);
      return;
    }

    let cancelled = false;
    getMe({ throwOnError: true })
      .then((res) => !cancelled && setUser(res.data.data))
      .catch(() => !cancelled && setUser(null));
    return () => {
      cancelled = true;
    };
  }, [store, user]);

  useEffect(
    () => onSessionExpired(() => store.getState().setUser(null)),
    [store],
  );

  return (
    <AuthStoreContext.Provider value={store}>
      {children}
    </AuthStoreContext.Provider>
  );
}

export function useAuth<T>(selector: (state: AuthState) => T): T {
  const store = useContext(AuthStoreContext);
  if (!store) throw new Error("useAuth must be used inside <AuthProvider>");
  return useStore(store, selector);
}
