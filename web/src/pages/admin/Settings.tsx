import { Navigate, useParams } from "react-router-dom";

import { QueryView } from "@/components/feedback/QueryView";
import { useAdminSettings } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import {
  InventorySection,
  PaymentsSection,
  ShippingSection,
  StoreSection,
} from "@/features/admin/components/settings/sections";
import type { SettingsResponse, SettingsSection } from "@/features/admin/types";
import { settingsSections } from "@/features/admin/settings-sections";

const components: Record<SettingsSection, (p: { data: SettingsResponse }) => React.JSX.Element> = {
  store: StoreSection,
  shipping: ShippingSection,
  payments: PaymentsSection,
  inventory: InventorySection,
};

export function Settings() {
  const { section } = useParams();
  const query = useAdminSettings();

  const current = settingsSections.find((s) => s.key === section);
  if (!current) {
    return <Navigate to={`/admin/settings/${settingsSections[0].key}`} replace />;
  }
  const Component = components[current.key];

  // Sections are picked from the sidebar (Settings → Store, Shipping, …).
  return (
    <AppPage title={`${current.label} settings`} description="Store-wide options. Changes apply to checkout right away.">
      <div className="max-w-3xl">
        {/* Keyed so a section's draft resets when switching sections. */}
        <QueryView query={query}>{(data) => <Component key={current.key} data={data} />}</QueryView>
      </div>
    </AppPage>
  );
}
