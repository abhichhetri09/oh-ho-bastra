import { BackToShop } from "@/components/common/BackToShop";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Search } from "@/components/icons";
import { PageShell } from "@/components/layout/PageShell";

export function NotFound() {
  return (
    <PageShell>
      <EmptyState
        icon={Search}
        title="Page not found"
        description="That path does not lead to a tee or a page."
        action={<BackToShop />}
      />
    </PageShell>
  );
}
