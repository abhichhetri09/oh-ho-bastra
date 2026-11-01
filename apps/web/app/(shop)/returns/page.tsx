import type { Metadata } from "next";
import { site } from "@/lib/site";
import { PolicyNote, PolicyPage } from "@/modules/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Returns & exchanges",
  description: `${site.name}'s returns and exchange policy: 30-day returns, size and colour exchanges, return shipping and refunds.`,
  alternates: { canonical: "/returns" },
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      current="/returns"
      title="Returns & exchanges"
      intro="Not quite right? You can return or exchange items within 30 days of delivery. Here's how it works."
      sections={[
        {
          id: "returns",
          title: "Returns",
          body: (
            <>
              <p>
                We accept returns within <strong>30 days</strong> of the
                delivery date. To be accepted, items must be:
              </p>
              <ul>
                <li>Unused and unwashed</li>
                <li>In their original condition, with the tags attached</li>
              </ul>
              <p>
                Email us with your order number before sending anything back,
                and we&apos;ll send you the return address.
              </p>
            </>
          ),
        },
        {
          id: "non-returnable",
          title: "Items that can't be returned",
          body: (
            <ul>
              <li>
                <strong>Final sale items</strong>, such as clearance or
                promotional items marked as final sale.
              </li>
              <li>
                <strong>Custom products</strong>, printed with your own artwork
                or text, once printing has started, because they&apos;re made to
                your specification.
              </li>
            </ul>
          ),
        },
        {
          id: "exchanges",
          title: "Exchanges",
          body: (
            <>
              <p>
                We&apos;re happy to exchange an item for a different{" "}
                <strong>size or colour</strong>, as long as the item you want is
                in stock. If it isn&apos;t available, we&apos;ll offer store
                credit or a refund instead.
              </p>
              <p>
                If we sent you the wrong size, we&apos;ll exchange it free of
                charge. If you ordered the wrong size yourself, please return
                the item under the returns policy above and place a new order.
              </p>
            </>
          ),
        },
        {
          id: "return-shipping",
          title: "Return shipping",
          body: (
            <>
              <p>
                You&apos;re responsible for the cost of return shipping, unless
                the item arrived damaged or we sent you the wrong item.
              </p>
              <PolicyNote>
                We recommend using a trackable shipping service. We can&apos;t
                be responsible for return parcels lost on their way to us.
              </PolicyNote>
            </>
          ),
        },
        {
          id: "refunds",
          title: "Refunds",
          body: (
            <>
              <p>
                Once we&apos;ve received and inspected your return, we&apos;ll
                let you know by email. Approved refunds are processed within{" "}
                <strong>5–10 business days</strong> to your original payment
                method.
              </p>
              <p>
                Original shipping charges are non-refundable, except where the
                item was faulty or incorrect, or where the law requires
                otherwise.
              </p>
            </>
          ),
        },
        {
          id: "your-rights",
          title: "Your statutory rights",
          body: (
            <p>
              This policy is in addition to your rights under EU and Finnish
              consumer law, including your right to withdraw from an online
              purchase within 14 days and your rights if an item is faulty.
              Nothing here limits those rights.
            </p>
          ),
        },
      ]}
    />
  );
}
