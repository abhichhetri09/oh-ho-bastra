import type { Metadata } from "next";
import { AdminsManager } from "@/modules/admin/components/admins-manager";
import { SettingsSection } from "@/modules/admin/components/settings-section";

export const metadata: Metadata = { title: "Admins · Settings" };

export default function AdminAdminsPage() {
  return (
    <SettingsSection page="admins">
      <AdminsManager />
    </SettingsSection>
  );
}
