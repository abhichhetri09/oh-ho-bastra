import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import {
  LegalPage,
  LegalSection,
  SellerDetails,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of sale",
  description: `The terms for buying from ${site.name}: prices, payment, delivery, returns and complaints.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of sale">
      <LegalSection title="1. Who you're buying from">
        <p>
          These terms apply to orders placed on ohhobastra.fi. The seller is:
        </p>
        <SellerDetails />
        <p>
          By placing an order you accept these terms. Please also read our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="2. Products and prices">
        <p>
          Prices are in euros and include Finnish VAT. Shipping is shown in your
          bag and at checkout before you pay. We do our best to show colours
          accurately, but screens vary.
        </p>
        <p>
          <strong>Custom products</strong> are printed with the artwork or text
          you send us. You confirm you have the right to use that artwork. We
          may decline a design that is unlawful, infringes someone else&apos;s
          rights or is offensive; if we do, we refund you in full.
        </p>
      </LegalSection>

      <LegalSection title="3. Ordering and payment">
        <p>
          Payment is taken at checkout through Stripe, by card or the other
          methods shown there. We never see or store your card details. Your
          order is confirmed when payment succeeds, and we send a confirmation
          email.
        </p>
        <p>
          If a product turns out to be unavailable, or a price was clearly shown
          in error, we will contact you and refund anything you paid.
        </p>
      </LegalSection>

      <LegalSection id="shipping" title="4. Delivery">
        <p>
          Standard shipping is free on orders over €60; otherwise it is a flat
          €4.90. Orders are dispatched within two to four working days.
        </p>
        <p>
          We ship to the countries listed at checkout. Delivery times after
          dispatch depend on the destination and the carrier, and we send a
          tracking number when there is one.
        </p>
        <p>
          <strong>Outside the EU</strong>, your country may charge customs
          duties, import VAT or handling fees on delivery. These are not part of
          our price and are paid by the recipient.
        </p>
      </LegalSection>

      <LegalSection id="returns" title="5. Returns and right of withdrawal">
        <p>
          You can return <strong>plain (non-custom) products</strong> within{" "}
          <strong>30 days</strong> of receiving them, for any reason. That is
          longer than the 14 days EU law requires.
        </p>
        <ul>
          <li>
            Email us with your order number before sending anything, so we can
            give you the return address.
          </li>
          <li>
            Items must be unworn, unwashed and in their original condition. We
            may deduct the value lost if an item has been used beyond what is
            needed to try it on.
          </li>
          <li>
            <strong>You pay the return postage</strong>, unless the item is
            faulty or we sent the wrong one.
          </li>
          <li>
            We refund the product price, and the original standard shipping cost
            if you return the whole order, within 14 days of receiving the
            return, to your original payment method.
          </li>
        </ul>
        <p>
          <strong>Custom products can&apos;t be returned</strong> or cancelled
          once printing has started, because they are made to your specification
          (Finnish Consumer Protection Act, chapter 6, section 16). This does
          not affect your rights if a custom product is faulty.
        </p>
      </LegalSection>

      <LegalSection title="6. Faulty or wrong items">
        <p>
          If something arrives damaged, faulty or isn&apos;t what you ordered,
          email us within a reasonable time of noticing, ideally with a photo.
          We will repair, replace or refund it and cover the return postage.
          This applies to custom products too, and your statutory rights under
          consumer law are not affected.
        </p>
      </LegalSection>

      <LegalSection title="7. Complaints and disputes">
        <p>
          Please contact us first and we will try to sort things out. If we
          can&apos;t agree, a consumer living in Finland can contact the
          consumer advisory service (Kuluttajaneuvonta) and take the matter to
          the Consumer Disputes Board (Kuluttajariitalautakunta,{" "}
          <a href="https://www.kuluttajariita.fi" rel="noreferrer">
            kuluttajariita.fi
          </a>
          ). Consumers in other EU countries can get help from their national
          European Consumer Centre.
        </p>
        <p>
          Finnish law applies to these terms, without taking away the protection
          your own country&apos;s consumer law gives you.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes">
        <p>
          We may update these terms. The version shown when you placed your
          order applies to that order.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
