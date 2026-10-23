import { Boxes, CreditCard, Store, Truck, type LucideIcon } from "@/components/icons";
import type { SettingsSection } from "./types";

/** Settings sections, in sidebar order. Shared by the admin nav and the settings page. */
export const settingsSections: { key: SettingsSection; label: string; icon: LucideIcon }[] = [
  { key: "store", label: "Store", icon: Store },
  { key: "shipping", label: "Shipping", icon: Truck },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "inventory", label: "Inventory", icon: Boxes },
];
