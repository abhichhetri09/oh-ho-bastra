import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { buttonVariants } from "@/components/ui/button";
import { fetchCurrentUser, sessionExpiredPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  // proxy.ts only decodes the access token; the API has the final word.
  const user = await fetchCurrentUser();
  if (!user) redirect(sessionExpiredPath("/account"));

  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const rows = [
    { label: "Name", value: user.name },
    { label: "Email", value: user.email },
    {
      label: "Account",
      value: user.role === "admin" ? "Administrator" : "Customer",
    },
  ];

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <p className="eyebrow animate-rise">Overview</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Hello, <em>{firstName}.</em>
        </h1>
      </header>

      <section
        className="animate-rise max-w-2xl"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Profile</h2>
          <Link
            href="/account/settings"
            className="link-underline text-xs text-muted-foreground hover:text-foreground"
          >
            Edit
          </Link>
        </div>
        <dl className="divide-y divide-border border-y border-border">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr]"
            >
              <dt className="text-[0.8125rem] text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 truncate text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="animate-rise flex flex-col justify-between gap-6 bg-secondary/60 p-8 sm:flex-row sm:items-center"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <div className="space-y-1">
          <p className="font-serif text-3xl">Something new is waiting.</p>
          <p className="text-sm text-muted-foreground">
            Fresh arrivals land every week.
          </p>
        </div>
        <Link
          href="/shop"
          className={buttonVariants({ className: "group shrink-0" })}
        >
          Continue shopping
          <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </section>
    </div>
  );
}
