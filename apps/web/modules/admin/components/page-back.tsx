import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";

/** The "← Orders" link above a detail page's title. */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
