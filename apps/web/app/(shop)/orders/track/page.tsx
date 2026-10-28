import type { Metadata } from "next";
import { TrackOrder } from "@/modules/checkout/components/track-order";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Find an order by its number and the email it was placed with.",
  robots: { index: false },
};

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string | string[] }>;
}) {
  // ?number= comes from the order emails and the success page.
  const { number } = await searchParams;
  return (
    <div className="container-page py-16 sm:py-24">
      <TrackOrder initialNumber={typeof number === "string" ? number : ""} />
    </div>
  );
}
