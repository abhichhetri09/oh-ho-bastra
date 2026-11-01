import type { Metadata } from "next";
import Link from "next/link";
import { shippingSentence } from "@/lib/shipping";
import { site } from "@/lib/site";
import { storeShipping } from "@/lib/theme-server";
import {
  FactTable,
  PolicyNote,
  PolicyPage,
} from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Shipping policy",
  description: `How ${site.name} processes, ships and tracks your order: delivery times, costs and what to do if a parcel arrives damaged.`,
  alternates: { canonical: "/shipping" },
};

export default async function ShippingPage() {
  const shipping = await storeShipping();
  return (
    <PolicyPage
      current="/shipping"
      title="Shipping policy"
      intro="How we process and ship your order, how long delivery takes and what to do if something goes wrong on the way."
      sections={[
        {
          id: "processing",
          title: "Processing time",
          body: (
            <>
              <p>
                All orders are processed within{" "}
                <strong>1–3 business days</strong>. Orders placed at weekends or
                on public holidays are processed on the next business day.
              </p>
              <p>If your order is delayed, we&apos;ll let you know by email.</p>
            </>
          ),
        },
        {
          id: "delivery-times",
          title: "Estimated delivery times",
          body: (
            <>
              <FactTable
                rows={[
                  { label: "Finland", value: "3–10 days" },
                  { label: "EU countries", value: "7–14 days" },
                  {
                    label: "International",
                    value: "7–21 business days, depending on the destination",
                  },
                ]}
              />
              <PolicyNote>
                Delivery may occasionally take longer because of customs
                inspections or carrier delays.
              </PolicyNote>
            </>
          ),
        },
        {
          id: "charges",
          title: "Shipping charges",
          body: (
            <>
              <p>{shippingSentence(shipping)}</p>
              <p>
                The exact delivery cost for your address, in Finland, the EU or
                elsewhere, is shown at checkout before you pay.
              </p>
              <p>
                <strong>Outside the EU</strong>, your country may charge customs
                duties, import VAT or handling fees on delivery. These are not
                included in our prices and are paid by the recipient.
              </p>
            </>
          ),
        },
        {
          id: "tracking",
          title: "Order tracking",
          body: (
            <>
              <p>
                Once your order has shipped, we&apos;ll email you the tracking
                number along with your order details. Tracking information can
                take up to 48 hours to appear after the order has been
                dispatched.
              </p>
              <p>
                You can also check the status at any time on the{" "}
                <Link href="/orders/track">track an order</Link> page.
              </p>
            </>
          ),
        },
        {
          id: "lost-parcels",
          title: "Lost or missing parcels",
          body: (
            <>
              <p>
                Please make sure your shipping address is correct and complete
                when you order. We can&apos;t be responsible for parcels sent to
                an incorrect address you entered.
              </p>
              <p>
                If your parcel hasn&apos;t arrived within the estimated delivery
                time, or tracking shows it as delivered but you can&apos;t find
                it, contact us and we&apos;ll work with the carrier to locate
                it. If a parcel is lost in transit, we&apos;ll send a
                replacement or a refund.
              </p>
            </>
          ),
        },
        {
          id: "damaged",
          title: "Damaged items",
          body: (
            <>
              <p>
                If your parcel arrives damaged, please contact us within{" "}
                <strong>48 hours</strong> of delivery with photos or a video of
                the product and the packaging. We&apos;ll arrange a replacement
                or refund, as appropriate.
              </p>
              <p>
                Reporting quickly helps us sort it out with the carrier. It
                doesn&apos;t affect your statutory rights for faulty goods.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
