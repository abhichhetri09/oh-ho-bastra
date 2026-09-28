import { Link } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Search } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** Not-found screen inside an app area, keeping its sidebar. */
export function AppNotFound({ home, label }: { home: string; label: string }) {
  return (
    <EmptyState
      icon={Search}
      title="Page not found"
      description="That page doesn’t exist, or the link is out of date."
      action={
        <Button variant="outline" asChild>
          <Link to={home}>Back to {label}</Link>
        </Button>
      }
    />
  );
}
