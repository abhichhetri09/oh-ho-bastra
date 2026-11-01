import type { Metadata } from "next";
import { site } from "@/lib/site";
import {
  PolicyPage,
  SellerDetails,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${site.name} collects, uses and protects your personal information.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      current="/privacy"
      title="Privacy policy"
      intro="What personal information we collect, why we collect it and how we keep it safe."
      sections={[
        {
          id: "controller",
          title: "Who is responsible",
          body: (
            <>
              <p>
                The controller of your personal data under the EU General Data
                Protection Regulation (GDPR) is:
              </p>
              <SellerDetails />
            </>
          ),
        },
        {
          id: "collect",
          title: "Information we collect",
          body: (
            <ul>
              <li>
                <strong>Personal information:</strong> your name, email address,
                phone number and shipping and billing address.
              </li>
              <li>
                <strong>Account information:</strong> if you create an account,
                a securely hashed password (or your Google account ID if you
                sign in with Google), your saved addresses, wishlist and
                reviews.
              </li>
              <li>
                <strong>Payment information:</strong> processed securely by our
                payment provider, Stripe. We never see or store your card
                details.
              </li>
              <li>
                <strong>Custom orders:</strong> the artwork or text you send us
                for printing.
              </li>
              <li>
                <strong>Device information:</strong> your IP address, browser
                type and the pages you request, recorded in our server logs.
              </li>
            </ul>
          ),
        },
        {
          id: "use",
          title: "How we use your information",
          body: (
            <>
              <p>We use your information to:</p>
              <ul>
                <li>Process, fulfil and deliver your orders</li>
                <li>Communicate with you about your orders and account</li>
                <li>Improve our website and your shopping experience</li>
                <li>Prevent fraud and keep our customers and shop secure</li>
                <li>
                  Keep the bookkeeping records Finnish accounting law requires
                </li>
              </ul>
              <p>
                We only send promotional emails if you&apos;ve asked to receive
                them, and you can opt out at any time.
              </p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Sharing your information",
          body: (
            <>
              <p>
                <strong>We will never sell your personal information.</strong>{" "}
                We share it only with the service providers who help us run the
                shop:
              </p>
              <ul>
                <li>
                  <strong>Shipping carriers</strong>, to deliver your orders
                </li>
                <li>
                  <strong>Stripe</strong>, to handle payments securely
                </li>
                <li>
                  <strong>Amazon Web Services</strong> and <strong>Neon</strong>
                  , for hosting and our database in the EU
                </li>
                <li>
                  <strong>Resend</strong>, to send order and account emails
                </li>
                <li>
                  <strong>Cloudinary</strong>, to store and serve images
                </li>
                <li>
                  <strong>Google</strong>, for &quot;Continue with Google&quot;
                  sign-in, if you use it
                </li>
              </ul>
              <p>
                Where a provider is based outside the EU, transfers rely on the
                EU–US Data Privacy Framework or the European Commission&apos;s
                standard contractual clauses.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <ul>
              <li>Account data: until you ask us to delete your account.</li>
              <li>
                Order records: six years after the end of the financial year, as
                the Finnish Accounting Act requires.
              </li>
              <li>Server logs: a few weeks.</li>
            </ul>
          ),
        },
        {
          id: "security",
          title: "Data security",
          body: (
            <p>
              We use secure technologies, including encrypted connections and
              hashed passwords, to protect your data. However, no system can
              guarantee 100% security.
            </p>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Our website uses only the cookies it needs to work, such as
              keeping you signed in. We don&apos;t use advertising or tracking
              cookies. You can disable cookies in your browser settings, but
              some features, like signing in, may then stop working.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>You have the right to:</p>
              <ul>
                <li>Access the personal data we hold about you</li>
                <li>Request corrections to it</li>
                <li>Ask us to delete your personal data</li>
                <li>Receive a copy of your data in a portable format</li>
                <li>Object to or restrict how we use it</li>
                <li>Opt out of marketing emails at any time</li>
              </ul>
              <p>
                Email us to make a request and we&apos;ll reply within a month.
                If you think we&apos;ve mishandled your data, you can complain
                to the Finnish Data Protection Ombudsman (
                <a href="https://tietosuoja.fi/en" rel="noreferrer">
                  tietosuoja.fi
                </a>
                ) or the data protection authority in your country.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
