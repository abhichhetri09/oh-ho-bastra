import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import {
  LegalPage,
  LegalSection,
  SellerDetails,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach ${site.name} about an order, a return or a custom print.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage eyebrow="Help" title="Contact us" showUpdated={false}>
      <LegalSection title="Get in touch">
        <p>
          Questions about an order, a return or a custom print? Email us and
          include your order number if you have one. We usually reply within one
          to two working days.
        </p>
        <SellerDetails />
      </LegalSection>

      <LegalSection title="Orders and returns">
        <ul>
          <li>
            Track your orders in{" "}
            <Link href="/account/orders">your account</Link>.
          </li>
          <li>
            Plain tees can be returned within 30 days.{" "}
            <Link href="/terms#returns">How returns work</Link>.
          </li>
          <li>
            Shipping costs and times:{" "}
            <Link href="/terms#shipping">delivery</Link>.
          </li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
