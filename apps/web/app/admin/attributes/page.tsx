import type { Metadata } from "next";
import { AttributesManager } from "@/modules/admin/components/attributes-manager";
import { AdminPageHeader } from "@/modules/admin/components/page-header";

export const metadata: Metadata = { title: "Options" };

export default function AdminAttributesPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Options"
        description="The sizes, colours and other options a variant is picked from. Changing a list doesn't change variants already made."
      />
      <AttributesManager />
    </>
  );
}
