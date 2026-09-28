import { randomUUID } from "node:crypto";

// Stand-in for Paytrail. The real flow: POST /payments to Paytrail, redirect the
// buyer to the returned href, then trust only the HMAC-signed success/cancel
// callback. Here the redirect goes to our own /pay/:id page, and that page
// reports the outcome back via POST /payments/:id/mock-complete.
export const provider = "mock-paytrail";

export function mockPaymentsEnabled() {
  return (process.env.PAYMENT_PROVIDER ?? "mock") === "mock";
}

// Finnish reference number (viitenumero): base digits plus a 7-3-1 check digit.
export function finnishReference(base: number) {
  const digits = String(base);
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * weights[i % 3];
  }
  return `${digits}${(10 - (sum % 10)) % 10}`;
}

export function createPayment(orderNumber: number) {
  const id = randomUUID();
  return {
    id,
    provider,
    reference: finnishReference(1000 + orderNumber),
    redirectUrl: `/pay/${id}`,
  };
}
