import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Close, Menu } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./BrandMark";
import { Sidebar } from "./Sidebar";
import type { ShellConfig } from "./types";

/** Full-height app layout: fixed sidebar on desktop, slide-in drawer on mobile. Used by admin and account. */
export function AppShell({ config }: { config: ShellConfig }) {
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState<string | null>(null);
  // The drawer belongs to the page it was opened on; navigating closes it.
  const open = drawer === pathname;

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      {/* The column carries the background; the inner aside sticks while the page scrolls. */}
      <div className="hidden border-r bg-sidebar lg:block">
        <aside className="sticky top-0 h-svh">
          <Sidebar config={config} />
        </aside>
      </div>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link to={config.home} className="flex items-center gap-2">
          <BrandMark />
          <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
        </Link>
        <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setDrawer(pathname)}>
          <Menu />
        </Button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={`${config.label} menu`}>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(null)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r shadow-xl">
            <Button variant="ghost" size="icon" aria-label="Close menu" className="absolute top-3 right-2 z-10" onClick={() => setDrawer(null)}>
              <Close />
            </Button>
            <Sidebar config={config} onNavigate={() => setDrawer(null)} />
          </div>
        </div>
      ) : null}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
