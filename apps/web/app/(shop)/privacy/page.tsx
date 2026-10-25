import type { Metadata } from "next";
import { site } from "@/lib/site";
import {
  LegalPage,
  LegalSection,
  SellerDetails,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${site.name} collects, uses and protects your personal data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy policy">
      <LegalSection title="Who is responsible">
        <p>
          The controller of your personal data under the EU General Data
          Protection Regulation (GDPR) is:
        </p>
        <SellerDetails />
      </LegalSection>

      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address, a hashed
            password (we can&apos;t read it) or your Google account ID if you
            sign in with Google, and a profile photo if you add one.
          </li>
          <li>
            <strong>Order details:</strong> what you bought, your shipping
            address and phone number, and the order&apos;s payment status. Card
            details go straight to Stripe; we never receive them.
          </li>
          <li>
            <strong>What you choose to send:</strong> reviews, saved addresses,
            wishlist items, and the artwork or text for custom prints.
          </li>
          <li>
            <strong>Technical data:</strong> server logs with IP addresses and
            request details, kept briefly to keep the shop secure and working.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>
            To take, ship and support your orders, and to send order emails
            (performing our contract with you).
          </li>
          <li>To run your account, if you create one (contract).</li>
          <li>
            To keep bookkeeping records, which Finnish accounting law requires
            (legal obligation).
          </li>
          <li>
            To prevent fraud and keep the shop secure (our legitimate interest).
          </li>
        </ul>
        <p>
          We don&apos;t sell your data, and we don&apos;t send marketing emails
          unless you&apos;ve asked for them.
        </p>
      </LegalSection>

      <LegalSection title="Who processes it for us">
        <p>
          We use these service providers, each bound by a data processing
          agreement:
        </p>
        <ul>
          <li>
            <strong>Stripe</strong>: payments.
          </li>
          <li>
            <strong>Amazon Web Services</strong> (Stockholm, Sweden): hosting.
          </li>
          <li>
            <strong>Neon</strong> (Frankfurt, Germany): our database.
          </li>
          <li>
            <strong>Resend</strong>: sending order and account emails.
          </li>
          <li>
            <strong>Cloudinary</strong>: storing and serving images.
          </li>
          <li>
            <strong>Google</strong>: &quot;Continue with Google&quot; sign-in,
            if you use it.
          </li>
        </ul>
        <p>
          Some of these companies are based in the United States. Transfers
          outside the EU rely on the EU–US Data Privacy Framework or the
          European Commission&apos;s standard contractual clauses.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>Account data: until you ask us to delete your account.</li>
          <li>
            Order records: six years after the end of the financial year, as the
            Finnish Accounting Act requires.
          </li>
          <li>Server logs: a few weeks.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We only use the cookies the shop needs to work: two sign-in cookies
          that keep you logged in. Your recent searches are saved in your own
          browser. We don&apos;t use advertising or analytics cookies, so
          there&apos;s nothing to consent to.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask to see the data we hold about you, correct it, delete it,
          get a copy in a portable format, or object to or restrict how we use
          it. Email us using the address above. We reply within a month.
        </p>
        <p>
          If you think we have mishandled your data, you can complain to the
          Finnish Data Protection Ombudsman (
          <a href="https://tietosuoja.fi/en" rel="noreferrer">
            tietosuoja.fi
          </a>
          ) or the data protection authority in your own country.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
