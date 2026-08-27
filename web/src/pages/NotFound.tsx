import { Link } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { Search } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <PageShell>
      <EmptyState
        icon={Search}
        title="Page not found"
        description="That path does not lead to a tee or a page."
        action={
          <Button variant="outline" asChild>
            <Link to="/">Back to shop</Link>
          </Button>
        }
      />
    </PageShell>
  );
}
