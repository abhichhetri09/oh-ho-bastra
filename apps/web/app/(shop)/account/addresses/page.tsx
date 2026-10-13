import type { Metadata } from "next";
import { AddressBook } from "@/modules/account/components/address-book";

export const metadata: Metadata = { title: "Addresses" };

export default function AddressesPage() {
  return <AddressBook />;
}
