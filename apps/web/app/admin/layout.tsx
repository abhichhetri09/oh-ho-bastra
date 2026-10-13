import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { site } from "@/lib/site";
import { AdminMobileNav } from "@/modules/admin/components/admin-mobile-nav";
import { AdminAccount, AdminNav } from "@/modules/admin/components/admin-nav";
import { LogoMark } from "@/components/brand/logo-mark";
import { CommandPalette } from "@/modules/admin/components/command-palette";

export const metadata: Metadata = {
  title: { template: `%s · Admin · ${site.name}`, default: "Admin" },
  robots: { index: false },
};

// The admin area has its own shell (no storefront header or footer).
// proxy.ts lets only admins in; the API checks the role again on every
// admin endpoint.
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <Link
          href="/admin"
          className="flex h-16 items-baseline gap-3 border-b border-sidebar-border px-5 pt-5"
        >
          <span className="font-serif text-[1.65rem] leading-none">
            <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
            {site.name}
          </span>
          <span className="eyebrow">Admin</span>
        </Link>
        {/* Scrolls on short screens instead of spilling past the sidebar. */}
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto py-6">
          <AdminNav />
          <AdminAccount />
        </div>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="flex items-baseline gap-3">
            <AdminMobileNav />
            <Link href="/admin" className="font-serif text-2xl lg:hidden">
              {site.name}
            </Link>
          </div>
          <div className="-mr-3 flex items-center gap-2">
            <CommandPalette />
            <Link
              href="/"
              target="_blank"
              className="group inline-flex h-10 items-center gap-1.5 px-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              View store
              <ArrowUpRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
