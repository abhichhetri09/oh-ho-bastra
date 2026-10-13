import { createStore } from "zustand/vanilla";
import type { PublicUser } from "@repo/types";

export type AuthState = {
  user: PublicUser | null;
  setUser: (user: PublicUser | null) => void;
};

export type AuthStore = ReturnType<typeof createAuthStore>;

// One store per AuthProvider (per request on the server), not a module
// global, so one visitor's user can never leak into another's render.
export function createAuthStore(user: PublicUser | null) {
  return createStore<AuthState>()((set) => ({
    user,
    setUser: (next) => set({ user: next }),
  }));
}
