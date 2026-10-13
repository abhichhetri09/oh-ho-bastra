import type { Metadata } from "next";
import { SuccessView } from "@/modules/checkout/components/success-view";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false },
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { session_id } = await searchParams;
  const sessionId = typeof session_id === "string" ? session_id : "";
  return (
    <div className="container-page">
      <SuccessView sessionId={sessionId} />
    </div>
  );
}
