"use client";

import Link from "next/link";
import {
  HeartIcon,
  PackageIcon,
  SignOutIcon,
  SquaresFourIcon,
  UserCircleIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLogout } from "@/modules/auth/hooks/mutations/use-logout";
import { useSavedCount } from "@/modules/wishlist/hooks";
import { useWishlistDrawer } from "@/modules/wishlist/store";
import { useAuth } from "@/providers/auth-provider";
import { SignInLink } from "@/modules/auth/components/sign-in-link";

/** Up to two initials for the avatar: "Ada Lovelace" → "AL". */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-mono tracking-wider text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

const item = "h-9 gap-2.5 rounded-control px-2.5 text-[0.8125rem]";
const icon = "size-4 text-muted-foreground";

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const savedCount = useSavedCount();
  const openWishlist = useWishlistDrawer((s) => s.setOpen);

  if (!user) {
    return (
      <SignInLink
        className={buttonVariants({
          variant: "ghost",
          className: "gap-2 px-2.5",
        })}
      >
        <UserIcon className="size-5" weight="light" />
        <span className="hidden sm:inline">Sign in</span>
      </SignInLink>
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "group rounded-full",
        )}
        aria-label="Account menu"
      >
        <Avatar
          name={user.name}
          className="size-8 text-[0.625rem] ring-offset-2 ring-offset-background transition-shadow group-hover:ring-1 group-hover:ring-foreground/25 group-data-popup-open:ring-1 group-data-popup-open:ring-foreground/40"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
          <Avatar name={user.name} className="size-10 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <span className="truncate">{user.name}</span>
              {isAdmin && (
                <span className="eyebrow shrink-0 rounded-control border border-border px-1.5 py-0.5 !text-[0.5625rem]">
                  Admin
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuGroup className="py-1">
          <DropdownMenuItem
            className={item}
            render={<Link href="/account/orders" />}
          >
            <PackageIcon weight="light" className={icon} />
            Orders
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onClick={() => openWishlist(true)}>
            <HeartIcon weight="light" className={icon} />
            Wishlist
            {savedCount > 0 && (
              <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                {savedCount}
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} render={<Link href="/account" />}>
            <UserCircleIcon weight="light" className={icon} />
            Account
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup className="py-1">
              <DropdownMenuItem
                className={item}
                render={<Link href="/admin" />}
              >
                <SquaresFourIcon weight="light" className={icon} />
                Admin dashboard
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuGroup className="pt-1">
          <DropdownMenuItem
            className={item}
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <SignOutIcon weight="light" className={icon} />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
