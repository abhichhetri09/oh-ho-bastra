import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  MapPinIcon,
  PhoneIcon,
} from "@phosphor-icons/react/ssr";
import { getSessionUser } from "@/lib/auth/session";
import { site } from "@/lib/site";
import { storeBusiness } from "@/lib/theme-server";
import { ContactForm } from "@/modules/contact/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: `Questions about an order, a return or a custom print? Get in touch with ${site.name}.`,
  alternates: { canonical: "/contact" },
};

const QUICK_LINKS = [
  { label: "Track an order", href: "/account/orders" },
  { label: "Returns and exchanges", href: "/terms#returns" },
  { label: "Shipping costs and times", href: "/terms#shipping" },
  { label: "Terms of sale", href: "/terms" },
];

export default async function ContactPage() {
  const [business, user] = await Promise.all([
    storeBusiness(),
    getSessionUser().catch(() => null),
  ]);
  const address = business.business_address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="container-page py-16 sm:py-24">
      <header className="mb-14 max-w-2xl space-y-4 sm:mb-20">
        <p className="eyebrow">Contact</p>
        <h1 className="display text-5xl sm:text-6xl lg:text-7xl">
          We&apos;re here to help.
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          Questions about an order, a return or a custom print? Send us a
          message and a real person will get back to you.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16">
        <aside className="order-2 space-y-10 lg:order-1">
          <ul className="divide-y divide-border border-y border-border">
            {business.business_email && (
              <ContactRow icon={EnvelopeSimpleIcon} label="Email">
                <a
                  href={`mailto:${business.business_email}`}
                  className="link-underline"
                >
                  {business.business_email}
                </a>
              </ContactRow>
            )}
            {business.business_phone && (
              <ContactRow icon={PhoneIcon} label="Phone">
                <a
                  href={`tel:${business.business_phone.replace(/\s/g, "")}`}
                  className="link-underline"
                >
                  {business.business_phone}
                </a>
              </ContactRow>
            )}
            <ContactRow icon={ClockIcon} label="Response time">
              Within one to two working days
            </ContactRow>
            {address.length > 0 && (
              <ContactRow icon={MapPinIcon} label="Address">
                {address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </ContactRow>
            )}
          </ul>

          <div>
            <p className="eyebrow mb-4">Quick answers</p>
            <ul className="space-y-1">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center justify-between rounded-control px-3 py-2.5 -mx-3 text-[0.9375rem] transition-colors hover:bg-surface"
                  >
                    {link.label}
                    <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {(business.business_name || business.business_id) && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {business.business_name}
              {business.business_id && (
                <>
                  <br />
                  Business ID (Y-tunnus) {business.business_id}
                </>
              )}
            </p>
          )}
        </aside>

        <div className="order-1 lg:order-2">
          <ContactForm
            defaults={user ? { name: user.name, email: user.email } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  icon: RowIcon,
  label,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 py-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
        <RowIcon className="size-4.5" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="eyebrow block">{label}</span>
        <span className="block text-[0.9375rem]">{children}</span>
      </span>
    </li>
  );
}
