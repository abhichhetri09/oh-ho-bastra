import { Link } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Bag, Shirt } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function EmptyBag({ description = "Add a tee when you’re ready." }: { description?: string }) {
  return (
    <EmptyState
      icon={Bag}
      title="The bag is empty"
      description={description}
      action={
        <Button asChild>
          <Link to="/#shop">
            <Shirt />
            Shop tees
          </Link>
        </Button>
      }
    />
  );
}
