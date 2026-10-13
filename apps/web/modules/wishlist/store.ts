"use client";

import { create } from "zustand";

// Whether the wishlist drawer is open. UI state only, shared by the
// header heart, the account menus, the "saved" toast and the drawer.
export const useWishlistDrawer = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
