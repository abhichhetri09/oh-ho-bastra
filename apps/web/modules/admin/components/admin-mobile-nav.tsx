"use client";

import { useState } from "react";
import { ListIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AdminAccount, AdminNav } from "./admin-nav";
import { Brand } from "@/components/brand/brand";

/** The sidebar as a sheet, below the lg breakpoint. */
export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" />
        }
      >
        <ListIcon className="size-5" />
        <span className="sr-only">Open admin menu</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
      >
        <div className="flex h-16 items-baseline gap-3 border-b border-sidebar-border px-5 pt-5">
          <SheetTitle className="font-serif text-2xl font-normal whitespace-nowrap in-data-[headline=wide]:text-xl">
            <Brand />
          </SheetTitle>
          <span className="eyebrow">Admin</span>
        </div>
        {/* Scrolls on short screens, like the desktop sidebar. */}
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto overscroll-contain py-6">
          <AdminNav onNavigate={() => setOpen(false)} />
          <AdminAccount onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
