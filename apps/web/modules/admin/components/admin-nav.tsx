"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatCircleTextIcon,
  EnvelopeSimpleIcon,
  GearSixIcon,
  PackageIcon,
  ReceiptIcon,
  SignOutIcon,
  SquaresFourIcon,
  StackIcon,
  TreeStructureIcon,
  UsersIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { AdminCounts } from "@repo/types";
import { cn } from "@/lib/utils";
import { useLogout } from "@/modules/auth/hooks/mutations/use-logout";
import { useAuth } from "@/providers/auth-provider";
import { useAdminCounts } from "../queries";

type Badge = { count: number; label: string; urgent?: boolean };

type NavLink = {
  label: string;
  href: string;
  icon: Icon;
  badge?: (counts: AdminCounts) => Badge;
};

export const groups: { label: string; links: NavLink[] }[] = [
  {
    label: "Overview",
    links: [{ label: "Dashboard", href: "/admin", icon: SquaresFourIcon }],
  },
  {
    label: "Sales",
    links: [
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ReceiptIcon,
        badge: (c) => ({ count: c.to_ship, label: "to ship" }),
      },
      { label: "Customers", href: "/admin/customers", icon: UsersIcon },
    ],
  },
  {
    label: "Catalog",
    links: [
      { label: "Products", href: "/admin/products", icon: PackageIcon },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: StackIcon,
        badge: (c) => ({ count: c.out_of_stock, label: "sold out" }),
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: TreeStructureIcon,
      },
      { label: "Reviews", href: "/admin/reviews", icon: ChatCircleTextIcon },
    ],
  },
  {
    label: "Store",
    links: [
      {
        label: "Emails",
        href: "/admin/emails",
        icon: EnvelopeSimpleIcon,
        badge: (c) => ({
          count: c.failed_emails,
          label: "failed",
          urgent: true,
        }),
      },
      { label: "Settings", href: "/admin/settings", icon: GearSixIcon },
    ],
  },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin sections in groups, for the sidebar and the mobile sheet. A
 * badge counts what's waiting in a section (orders to ship, sold-out
 * variants, failed emails).
 */
export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useAdminCounts().data;
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-4 font-mono text-[0.5625rem] tracking-[0.18em] text-muted-foreground/80 uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.links.map(({ label, href, icon: LinkIcon, badge }) => {
              const b = counts && badge?.(counts);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={
                      isCurrent(pathname, href) ? "page" : undefined
                    }
                    className={cn(
                      "flex h-9 items-center gap-3 border-l-2 border-transparent px-4 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
                      "aria-[current=page]:border-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground",
                    )}
                  >
                    <LinkIcon className="size-4" weight="light" />
                    {label}
                    {b && b.count > 0 && (
                      <span
                        className={cn(
                          "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[0.625rem] tabular-nums",
                          b.urgent
                            ? "bg-destructive text-white"
                            : "bg-foreground text-background",
                        )}
                      >
                        {b.count > 99 ? "99+" : b.count}
                        <span className="sr-only"> {b.label}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Who is signed in, with a way out. */
export function AdminAccount() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  if (!user) return null;
  return (
    <div className="space-y-3 px-4">
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem]">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <SignOutIcon className="size-3.5" />
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
