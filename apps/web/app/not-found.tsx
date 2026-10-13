import { NotFoundView } from "@/components/feedback/not-found-view";
import { MinimalHeader } from "@/components/layout/minimal-header";

// Outside the shop layout (an unmatched URL): its own minimal header.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col">
      <MinimalHeader className="container-page" />
      <NotFoundView />
    </main>
  );
}
