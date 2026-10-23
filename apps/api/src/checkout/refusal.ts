import type { ErrorCode } from "@repo/types";

/**
 * A checkout or fulfilment error the handler sends as is (status, code and
 * message); anything else thrown by the service is a 500.
 */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "Refusal";
  }
}

export const errCartEmpty = new Refusal(409, "CART_EMPTY", "Your bag is empty");
export const errCartHasIssues = new Refusal(
  409,
  "CART_HAS_ISSUES",
  "Some items in your bag need attention before checkout",
);
export const errAddressNotFound = new Refusal(
  404,
  "ADDRESS_NOT_FOUND",
  "Address not found",
);
export const errProvider = new Refusal(
  502,
  "PAYMENT_PROVIDER_ERROR",
  "We couldn't reach the payment provider. Your bag is unchanged; try again.",
);
