import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-medium tracking-tight">Page not found</h1>
      <Button variant="link" className="px-0" asChild>
        <Link to="/">Back to shop</Link>
      </Button>
    </section>
  );
}
