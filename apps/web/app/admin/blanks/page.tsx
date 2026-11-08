import type { Metadata } from "next";
import { BlanksManager } from "@/modules/admin/components/blanks-manager";
import { AdminPageHeader } from "@/modules/admin/components/page-header";

export const metadata: Metadata = { title: "Blanks" };

export default function AdminBlanksPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Blanks"
        description="Plain garments you print to order. Every variant linked to a blank shares its stock: selling one print takes a unit from all the prints on that blank."
      />
      <BlanksManager />
    </>
  );
}
