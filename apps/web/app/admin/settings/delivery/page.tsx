import type { Metadata } from "next";
import { DeliverySettings } from "@/modules/admin/components/delivery-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { storeShipping } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Delivery · Settings" };

export default async function AdminDeliveryPage() {
  return (
    <SettingsSection page="delivery">
      <DeliverySettings initial={await storeShipping()} />
    </SettingsSection>
  );
}
