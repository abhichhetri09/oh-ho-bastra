import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CalendarBlankIcon,
  EnvelopeSimpleIcon,
  InfoIcon,
  LinkSimpleIcon,
  ListNumbersIcon,
  PhoneIcon,
} from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/reveal";
import { site } from "@/lib/site";
import { storeBusiness } from "@/lib/theme-server";
import { PolicyNav } from "./policy-nav";
import { PolicyToc, PolicyTocMobile } from "./policy-toc";

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

/** A key fact shown in the "At a glance" strip under the title. */
export type PolicyHighlight = {
  value: ReactNode;
  label: string;
};

/**
 * A policy page: a header band with the key facts, the other policies and a
 * contents list beside numbered sections, and a way to reach us at the end.
 */
export function PolicyPage({
  current,
  title,
  intro,
  highlights,
  sections,
}: {
  current: PolicyHref;
  title: string;
  intro: ReactNode;
  highlights?: PolicyHighlight[];
  sections: PolicySection[];
}) {
  const toc = sections.map(({ id, title }) => ({ id, title }));

  return (
    <div id="top">
      <header className="border-b border-border bg-secondary/40">
        <div className="container-page pt-12 pb-10 sm:pt-20 sm:pb-14">
          <div className="max-w-3xl space-y-5">
            <p className="eyebrow">Policies</p>
            <h1 className="display text-[2.5rem] leading-[1.05] sm:text-6xl">
              {title}
            </h1>
            <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
              {intro}
            </p>
            <dl className="flex flex-wrap gap-x-5 gap-y-2 pt-1 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
              <div className="flex items-center gap-2">
                <CalendarBlankIcon className="size-3.5" aria-hidden />
                <dt className="sr-only">Last updated</dt>
                <dd>Updated {formatUpdated(site.legalUpdated)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <ListNumbersIcon className="size-3.5" aria-hidden />
                <dt className="sr-only">Length</dt>
                <dd>{sections.length} sections</dd>
              </div>
            </dl>
          </div>

          {highlights && highlights.length > 0 && (
            <div className="mt-10 sm:mt-12">
              <p className="eyebrow mb-3">At a glance</p>
              <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-3">
                {highlights.map((h) => (
                  <div
                    key={h.label}
                    className="flex flex-col-reverse gap-1 bg-card px-5 py-4 sm:gap-1.5 sm:py-5"
                  >
                    <dd className="font-serif text-xl leading-tight sm:text-2xl">
                      {h.value}
                    </dd>
                    <dt className="text-sm text-muted-foreground">{h.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </header>

      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-8 pt-6 pb-16 sm:pb-24 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:pt-14">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
          <PolicyNav policies={POLICIES} current={current} />
          <div className="mt-6 lg:hidden">
            <PolicyTocMobile sections={toc} />
          </div>
          <div className="mt-10 hidden lg:block">
            <PolicyToc sections={toc} />
          </div>
        </aside>

        <div className="min-w-0 max-w-3xl">
          <ol>
            {sections.map((section, i) => (
              <li
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-b border-border py-10 first:pt-2 last:border-b-0 sm:py-12 lg:first:pt-0"
              >
                <Reveal y={16}>
                  <section
                    aria-labelledby={`${section.id}-title`}
                    className="space-y-5"
                  >
                    <div className="flex items-center gap-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2
                        id={`${section.id}-title`}
                        className="group font-serif text-2xl leading-tight text-balance sm:text-[1.75rem]"
                      >
                        {section.title}
                        <a
                          href={`#${section.id}`}
                          aria-label={`Link to ${section.title}`}
                          className="ml-2 inline-block align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <LinkSimpleIcon className="size-4" />
                        </a>
                      </h2>
                    </div>
                    <div className="space-y-4 text-[0.9375rem] leading-[1.75] text-muted-foreground sm:pl-13 [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a:hover]:decoration-current [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground/50">
                      {section.body}
                    </div>
                  </section>
                </Reveal>
              </li>
            ))}
          </ol>
          <PolicyContact />
          <a
            href="#top"
            className="mt-8 inline-flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            <ArrowUpIcon className="size-3.5" />
            Back to top
          </a>
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
    <dl className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-card text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 px-4 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 sm:px-5"
        >
          <dt className="font-medium text-foreground">{row.label}</dt>
          <dd className="text-muted-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A highlighted note inside a section. */
export function PolicyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-3 rounded-panel border border-border bg-secondary/50 px-4 py-3.5 text-sm leading-relaxed">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** "Questions?" at the end of every policy: the store's email and phone. */
async function PolicyContact() {
  const b = await storeBusiness();
  const action =
    "inline-flex items-center gap-2 rounded-control border border-background/20 px-4 py-2.5 text-sm transition-colors hover:bg-background/10";
  return (
    <div className="mt-6 overflow-hidden rounded-panel bg-foreground p-6 text-background sm:p-10">
      <p className="font-mono text-[0.6875rem] tracking-[0.12em] uppercase opacity-60">
        Questions?
      </p>
      <p className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">
        We&apos;re happy to help.
      </p>
      <p className="mt-3 max-w-md text-sm leading-relaxed opacity-70">
        If anything in our policies is unclear, get in touch and we&apos;ll get
        back to you.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/contact"
          className="inline-flex items-center justify-center gap-2 rounded-control bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-90"
        >
          Contact us
          <ArrowRightIcon className="size-3.5" />
        </Link>
        {b.business_email && (
          <a href={`mailto:${b.business_email}`} className={action}>
            <EnvelopeSimpleIcon className="size-4 opacity-70" />
            <span className="truncate">{b.business_email}</span>
          </a>
        )}
        {b.business_phone && (
          <a
            href={`tel:${b.business_phone.replace(/\s/g, "")}`}
            className={action}
          >
            <PhoneIcon className="size-4 opacity-70" />
            {b.business_phone}
          </a>
        )}
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
