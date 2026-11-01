import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
} from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/reveal";
import { site } from "@/lib/site";
import { storeBusiness } from "@/lib/theme-server";
import { cn } from "@/lib/utils";

/** The store's policies, in the order the side navigation lists them. */
export const POLICIES = [
  { href: "/shipping", label: "Shipping policy" },
  { href: "/returns", label: "Returns & exchanges" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
] as const;

export type PolicyHref = (typeof POLICIES)[number]["href"];

export type PolicySection = {
  id: string;
  title: string;
  body: ReactNode;
};

function formatUpdated(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A policy page: a header, the other policies beside it, a contents list,
 * numbered sections and a way to reach us at the end.
 */
export function PolicyPage({
  current,
  title,
  intro,
  sections,
}: {
  current: PolicyHref;
  title: string;
  intro: ReactNode;
  sections: PolicySection[];
}) {
  return (
    <div className="container-page py-14 sm:py-20">
      <header className="mb-10 max-w-3xl space-y-4 border-b border-border pb-10 sm:mb-14 sm:pb-14">
        <p className="eyebrow">Policies</p>
        <h1 className="display text-4xl sm:text-6xl">{title}</h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          {intro}
        </p>
        <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
          Last updated {formatUpdated(site.legalUpdated)}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav aria-label="Policies">
            <p className="eyebrow mb-3 hidden lg:block">All policies</p>
            <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
              {POLICIES.map((policy) => (
                <li key={policy.href} className="shrink-0">
                  <Link
                    href={policy.href}
                    aria-current={policy.href === current ? "page" : undefined}
                    className={cn(
                      "block rounded-full border border-border px-4 py-2 text-[0.8125rem] whitespace-nowrap transition-colors lg:rounded-control lg:border-transparent lg:px-3",
                      policy.href === current
                        ? "border-foreground bg-foreground text-background lg:border-transparent lg:bg-secondary lg:text-foreground"
                        : "text-muted-foreground hover:text-foreground lg:hover:bg-secondary/60",
                    )}
                  >
                    {policy.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="On this page" className="mt-10 hidden lg:block">
            <p className="eyebrow mb-3">On this page</p>
            <ol className="space-y-2 border-l border-border text-[0.8125rem]">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px flex gap-2 border-l border-transparent pl-4 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <span className="font-mono text-[0.6875rem] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="max-w-3xl">
          <ol className="divide-y divide-border">
            {sections.map((section, i) => (
              <li
                key={section.id}
                id={section.id}
                className="scroll-mt-28 py-8 first:pt-0"
              >
                <Reveal
                  className="grid gap-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6"
                  y={16}
                >
                  <span className="font-mono text-xs text-muted-foreground tabular-nums sm:pt-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <section className="space-y-4">
                    <h2 className="font-serif text-2xl sm:text-[1.75rem]">
                      {section.title}
                    </h2>
                    <div className="space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a:hover]:decoration-current [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:marker:text-border">
                      {section.body}
                    </div>
                  </section>
                </Reveal>
              </li>
            ))}
          </ol>
          <PolicyContact />
        </div>
      </div>
    </div>
  );
}

/** A small table of facts, such as delivery times by region. */
export function FactTable({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-panel border border-border text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-1 bg-card px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
        >
          <dt className="text-foreground">{row.label}</dt>
          <dd className="text-muted-foreground sm:text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A highlighted note inside a section. */
export function PolicyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-panel border border-border bg-secondary/50 px-4 py-3 text-sm">
      {children}
    </p>
  );
}

/** "Questions?" at the end of every policy: the store's email and phone. */
async function PolicyContact() {
  const b = await storeBusiness();
  return (
    <div className="mt-8 rounded-panel border border-border bg-card p-6 sm:p-8">
      <p className="eyebrow mb-2">Questions?</p>
      <p className="font-serif text-2xl">We&apos;re happy to help.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        If anything in our policies is unclear, get in touch and we&apos;ll get
        back to you.
      </p>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        {b.business_email && (
          <a
            href={`mailto:${b.business_email}`}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <EnvelopeSimpleIcon className="size-4 text-muted-foreground" />
            {b.business_email}
          </a>
        )}
        {b.business_phone && (
          <a
            href={`tel:${b.business_phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <PhoneIcon className="size-4 text-muted-foreground" />
            {b.business_phone}
          </a>
        )}
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 hover:underline"
        >
          Contact form
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * The seller's name, business ID, address and contact, as Admin → Settings
 * holds them. Fields left empty there are left out here.
 */
export async function SellerDetails() {
  const b = await storeBusiness();
  const address = b.business_address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!b.business_name && !b.business_email && address.length === 0) {
    return (
      <p>
        Our business details are being updated. Until then, reach us through
        your order confirmation email.
      </p>
    );
  }
  return (
    <address className="rounded-panel border border-border bg-card px-4 py-3 text-sm not-italic">
      {b.business_name && <strong className="block">{b.business_name}</strong>}
      {b.business_id && (
        <span className="block">Business ID (Y-tunnus): {b.business_id}</span>
      )}
      {address.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      {b.business_email && (
        <a className="block w-fit" href={`mailto:${b.business_email}`}>
          {b.business_email}
        </a>
      )}
      {b.business_phone && (
        <a
          className="block w-fit"
          href={`tel:${b.business_phone.replace(/\s/g, "")}`}
        >
          {b.business_phone}
        </a>
      )}
    </address>
  );
}
