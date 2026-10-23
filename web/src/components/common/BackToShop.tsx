import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function BackToShop({ label = "Back to shop", to = "/" }: { label?: string; to?: string }) {
  return (
    <Button variant="outline" asChild>
      <Link to={to}>{label}</Link>
    </Button>
  );
}
