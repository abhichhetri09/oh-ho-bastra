import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import {
  PolicyPage,
  SellerDetails,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Terms & conditions",
  description: `The terms for using ${site.name}'s website and buying from us.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyPage
      current="/terms"
      title="Terms & conditions"
      intro={`Welcome to ${site.name}. By accessing or using our website, you agree to the following terms.`}
      sections={[
        {
          id: "seller",
          title: "Who you're buying from",
          body: (
            <>
              <p>
                These terms apply to orders placed on our website. The seller
                is:
              </p>
              <SellerDetails />
              <p>
                Please also read our{" "}
                <Link href="/shipping">shipping policy</Link>,{" "}
                <Link href="/returns">returns &amp; exchanges policy</Link> and{" "}
                <Link href="/privacy">privacy policy</Link>, which form part of
                these terms.
              </p>
            </>
          ),
        },
        {
          id: "use",
          title: "Use of our website",
          body: (
            <p>
              You agree not to use our website for any illegal, harmful or
              unauthorised purpose.
            </p>
          ),
        },
        {
          id: "products",
          title: "Product information",
          body: (
            <>
              <p>
                We strive to display product descriptions, sizing and colours as
                accurately as possible. However, slight variations may occur
                depending on your device&apos;s display.
              </p>
              <p>
                <strong>Custom products</strong> are printed with the artwork or
                text you send us, and you confirm you have the right to use it.
                We may decline a design that is unlawful, infringes someone
                else&apos;s rights or is offensive; if we do, we refund you in
                full.
              </p>
            </>
          ),
        },
        {
          id: "orders",
          title: "Orders",
          body: (
            <>
              <p>
                Your order is confirmed when payment succeeds, and we send you a
                confirmation email. We reserve the right to refuse or cancel an
                order in cases of:
              </p>
              <ul>
                <li>Suspected fraudulent activity</li>
                <li>Incorrect pricing</li>
                <li>Stock unavailability</li>
              </ul>
              <p>
                If your order is cancelled, we&apos;ll notify you and issue a
                full refund.
              </p>
            </>
          ),
        },
        {
          id: "pricing",
          title: "Pricing and payment",
          body: (
            <p>
              All prices are in euros (€) and include Finnish VAT. Prices may
              change without notice, but the price shown when you place your
              order is the one you pay. Payment is taken securely at checkout
              through Stripe.
            </p>
          ),
        },
        {
          id: "ip",
          title: "Intellectual property",
          body: (
            <p>
              All images, logos and content on this website are the property of{" "}
              {site.name} and may not be used without our permission.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <>
              <p>To the extent permitted by law, we are not responsible for:</p>
              <ul>
                <li>Delays caused by shipping carriers</li>
                <li>Losses resulting from misuse of our products</li>
                <li>The content of third-party websites we link to</li>
              </ul>
              <p>
                Nothing in these terms limits your statutory rights as a
                consumer.
              </p>
            </>
          ),
        },
        {
          id: "disputes",
          title: "Complaints and disputes",
          body: (
            <>
              <p>
                Please contact us first and we&apos;ll do our best to sort
                things out. If we can&apos;t agree, consumers in Finland can
                contact the Consumer Disputes Board (
                <a href="https://www.kuluttajariita.fi" rel="noreferrer">
                  kuluttajariita.fi
                </a>
                ). Consumers in other EU countries can get help from their
                national European Consumer Centre.
              </p>
              <p>
                Finnish law applies to these terms, without removing the
                protection your own country&apos;s consumer law gives you.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms at any time. Changes take effect as soon
              as they are posted; the version shown when you placed your order
              applies to that order.
            </p>
          ),
        },
      ]}
    />
  );
}
