import type { ReactNode } from "react";
import { site } from "@/lib/site";
import { storeBusiness } from "@/lib/theme-server";

/** A long-form text page (terms, privacy, contact): heading, then sections. */
export function LegalPage({
  eyebrow,
  title,
  showUpdated = true,
  children,
}: {
  eyebrow: string;
  title: string;
  showUpdated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-16 sm:py-24">
      <header className="mb-12 max-w-2xl space-y-4 sm:mb-16">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-5xl sm:text-6xl">{title}</h1>
        {showUpdated && (
          <p className="text-sm text-muted-foreground">
            Last updated {site.legalUpdated}
          </p>
        )}
      </header>
      <div className="max-w-2xl space-y-12 text-[0.9375rem] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/** One numbered or titled block of a legal page. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-4">
      <h2 className="font-serif text-2xl sm:text-3xl">{title}</h2>
      <div className="space-y-3 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-border [&_a:hover]:decoration-current [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
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
    <address className="not-italic">
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
