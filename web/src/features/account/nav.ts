import { Dashboard, Receipt, ShieldCheck, Truck, type LucideIcon } from "@/components/icons";

/** Account pages, shared by the account sidebar and the store header's account menu. */
export const accountLinks: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/account", label: "Overview", icon: Dashboard, end: true },
  { to: "/account/orders", label: "Orders", icon: Receipt },
  { to: "/account/address", label: "Address", icon: Truck },
  { to: "/account/profile", label: "Profile & security", icon: ShieldCheck },
];
