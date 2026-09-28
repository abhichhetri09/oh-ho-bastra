import { useState } from "react";

import { useSavedAddress } from "@/features/account/api";
import { useSessionUser } from "@/features/auth/useSessionUser";
import type { CheckoutDetails, CheckoutOptions } from "./types";

const emptyDetails: CheckoutDetails = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  street: "",
  postalCode: "",
  city: "",
  shippingMethod: "",
  paymentMethod: "",
};

/**
 * Checkout form state. The saved address (or the account name), the account
 * email and the first shipping/payment option fill in until the buyer edits them.
 */
export function useCheckoutForm(options: CheckoutOptions | undefined) {
  const { user } = useSessionUser();
  const { data: saved } = useSavedAddress(Boolean(user));
  const [edits, setEdits] = useState<Partial<CheckoutDetails>>({});
  const [firstName = "", ...rest] = user?.name.split(" ") ?? [];

  const values: CheckoutDetails = {
    ...emptyDetails,
    email: user?.email ?? "",
    firstName,
    lastName: rest.join(" "),
    ...(saved
      ? {
          firstName: saved.firstName,
          lastName: saved.lastName,
          phone: saved.phone,
          street: saved.street,
          postalCode: saved.postalCode,
          city: saved.city,
        }
      : {}),
    shippingMethod: options?.shippingOptions[0]?.id ?? "",
    paymentMethod: options?.paymentMethods[0]?.id ?? "",
    ...edits,
  };

  function set<K extends keyof CheckoutDetails>(field: K, value: CheckoutDetails[K]) {
    setEdits((current) => ({ ...current, [field]: value }));
  }

  /** Props for a text input bound to one field. */
  function bind(field: keyof CheckoutDetails) {
    return {
      id: field,
      value: values[field],
      required: true,
      onChange: (event: { target: { value: string } }) => set(field, event.target.value),
    };
  }

  return { values, set, bind };
}
