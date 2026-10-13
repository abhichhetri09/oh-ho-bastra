"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { loginPath, registerPath } from "@/lib/auth/redirect";

/**
 * A link to sign in (or create an account) that brings the shopper back to
 * exactly where they were, query string included: listing filters and the
 * chosen variant live in it, set by history.pushState/replaceState, so it is
 * read when clicked. The href (path only) still works without JavaScript and
 * for opening in a new tab.
 */
export function SignInLink({
  register = false,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { register?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const target = register ? registerPath : loginPath;

  return (
    <Link
      {...props}
      href={target(pathname)}
      onClick={(event) => {
        onClick?.(event);
        const plain =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey;
        if (event.defaultPrevented || !plain) return;
        event.preventDefault();
        router.push(target(pathname + window.location.search));
      }}
    />
  );
}
