import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderView } from "@/modules/checkout/components/orders-view";
import { orderLabel, parseOrderNumber } from "@/modules/checkout/lib/orders";

type Params = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const number = parseOrderNumber((await params).number);
  return { title: number ? `Order ${orderLabel(number)}` : "Order" };
}

export default async function OrderPage({ params }: Params) {
  const raw = (await params).number;
  const number = parseOrderNumber(raw);
  if (!number) notFound();
  // "OHB-1042" or "01042" lands on the one URL the app links to
  if (raw !== String(number)) redirect(`/account/orders/${number}`);
  return <OrderView number={number} />;
}
