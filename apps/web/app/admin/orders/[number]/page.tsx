import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderDetailView } from "@/modules/admin/components/order-detail";
import { orderLabel, parseOrderNumber } from "@/modules/checkout/lib/orders";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const number = parseOrderNumber((await params).number);
  return { title: number ? `Order ${orderLabel(number)}` : "Order" };
}

export default async function AdminOrderPage({ params }: Props) {
  const raw = (await params).number;
  const number = parseOrderNumber(raw);
  if (!number) notFound();
  // "OHB-1042" or "01042" lands on the one URL the app links to
  if (raw !== String(number)) redirect(`/admin/orders/${number}`);
  return <OrderDetailView number={number} />;
}
