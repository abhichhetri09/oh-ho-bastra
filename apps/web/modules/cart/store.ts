"use client";

import { create } from "zustand";
import { useWishlistDrawer } from "@/modules/wishlist/store";

// Whether the bag drawer is open. UI state only, shared by the header
// button, the "added" toast and the drawer. Opening it closes the wishlist
// drawer, so "View bag" from a saved item doesn't stack two drawers.
export const useBagDrawer = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({
  open: false,
  setOpen: (open) => {
    if (open) useWishlistDrawer.getState().setOpen(false);
    set({ open });
  },
}));
