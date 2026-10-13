"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useLogout } from "@/modules/auth/hooks/mutations/use-logout";

const links = [
  { label: "Overview", href: "/account" },
  { label: "Orders", href: "/account/orders" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Addresses", href: "/account/addresses" },
  { label: "Settings", href: "/account/settings" },
];

export function AccountNav() {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <nav
      aria-label="Account"
      className="flex gap-1 overflow-x-auto lg:flex-col"
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={
            pathname === link.href ||
            (link.href !== "/account" && pathname.startsWith(`${link.href}/`))
              ? "page"
              : undefined
          }
          className={cn(
            "flex h-10 shrink-0 items-center border-l-2 border-transparent px-4 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground",
            "aria-[current=page]:border-foreground aria-[current=page]:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="flex h-10 shrink-0 items-center gap-2 border-l-2 border-transparent px-4 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 lg:mt-6"
      >
        <SignOutIcon className="size-4" />
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </nav>
  );
}
