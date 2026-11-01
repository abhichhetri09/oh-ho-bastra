import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const account = {
  status: 200 as const,
  description: "The customer's store credit as it now is",
  schema: schemas.CreditAccountResponseSchema,
};
const customer = z.object({ userID: Uuid });
const customerNotFound =
  "No such customer (CUSTOMER_NOT_FOUND), or a bad id (INVALID_USER_ID)";

export function registerReferralPaths() {
  operation({
    method: "get",
    path: "/api/v1/referrals/{code}",
    operationId: "getReferralOffer",
    tag: "Referrals",
    summary: "What a referral link offers",
    description:
      "The friend's discount a shared link's code gives (any case), for the storefront's welcome. Whether it applies to a shopper (a first order, not the referrer's own) is checked on their bag. Unknown codes are limited to 10 per 15 minutes, against guessing.",
    request: { params: z.object({ code: z.string() }) },
    success: {
      status: 200,
      description: "Referral offer fetched",
      schema: schemas.ReferralOfferResponseSchema,
    },
    errors: {
      404: "No such code, or the programme is off (REFERRAL_NOT_FOUND; the message says which)",
      429: "Too many unknown codes (TOO_MANY_REQUESTS)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/account/referrals",
    operationId: "getMyReferrals",
    tag: "Referrals",
    summary: "My referral code and referrals",
    description:
      "The customer's code (made the first time they ask; it never changes), the programme as it is now, the friends the code brought (newest first, at most 100, emails masked) and their store credit.",
    auth: "account",
    success: {
      status: 200,
      description: "Referrals fetched",
      schema: schemas.MyReferralsResponseSchema,
    },
    errors: { 404: "The programme is off (REFERRALS_DISABLED)" },
  });

  operation({
    method: "get",
    path: "/api/v1/account/credit",
    operationId: "getMyCredit",
    tag: "Referrals",
    summary: "My store credit",
    description:
      "The balance, what unpaid checkouts don't hold, and the most of an order's total credit can pay (checkout's use_credit).",
    auth: "account",
    success: {
      status: 200,
      description: "Store credit fetched",
      schema: schemas.MyCreditResponseSchema,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/referrals",
    operationId: "adminListReferrals",
    tag: "Admin",
    summary: "Referrals",
    description:
      "Newest first, 20 per page: the referrer, the friend, the order, the status and when it pays out (or did). Abandoned checkouts show as cancelled.",
    auth: "admin",
    request: {
      query: z.object({
        page: z.int().min(1).max(100_000).optional(),
        status: schemas.ReferralStatusSchema.optional(),
      }),
    },
    success: {
      status: 200,
      description: "Referrals fetched",
      schema: schemas.AdminReferralListResponseSchema,
    },
    errors: {
      400: "Invalid page (INVALID_PAGE_PARAMETER) or status (INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/credit/customers",
    operationId: "adminSearchCreditCustomers",
    tag: "Admin",
    summary: "Find a customer's store credit",
    description:
      "Customers whose name or email contains q (2 characters or more; fewer finds nobody), at most 20, with their balances.",
    auth: "admin",
    request: { query: z.object({ q: z.string().optional() }) },
    success: {
      status: 200,
      description: "Customers fetched",
      schema: schemas.CreditCustomerListResponseSchema,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/credit/customers/{userID}",
    operationId: "adminGetCreditAccount",
    tag: "Admin",
    summary: "A customer's store credit",
    description:
      "The balance, what's free to spend and the ledger, newest first.",
    auth: "admin",
    request: { params: customer },
    success: { ...account, description: "Store credit fetched" },
    errors: { 400: customerNotFound, 404: customerNotFound },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/credit/customers/{userID}/adjust",
    operationId: "adminAdjustCredit",
    tag: "Admin",
    summary: "Adjust a customer's store credit",
    description:
      "Adds (above 0) or takes off (below 0) credit by hand, with a note saying why; taking off more than is free to spend is refused.",
    auth: "admin",
    request: { params: customer, ...body(schemas.CreditAdjustBodySchema) },
    success: { ...account, description: "Store credit adjusted" },
    errors: {
      400: "Invalid body (VALIDATION_FAILED) or id (INVALID_USER_ID)",
      404: "No such customer (CUSTOMER_NOT_FOUND)",
      409: "Not that much credit (CREDIT_NOT_ENOUGH)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/credit/customers/{userID}/redemptions",
    operationId: "adminStartCreditRedemption",
    tag: "Admin",
    summary: "Use store credit on an in-store bill",
    description:
      "Checks the amount against the customer's credit and the store's share of the bill, then emails the customer a 6-digit code (valid 10 minutes, 5 tries) for staff to confirm with.",
    auth: "admin",
    request: { params: customer, ...body(schemas.CreditRedeemBodySchema) },
    success: {
      status: 201,
      description: "Code sent to the customer",
      schema: schemas.CreditRedemptionResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED) or id (INVALID_USER_ID)",
      404: "No such customer (CUSTOMER_NOT_FOUND)",
      409: "Over the store's share of the bill (CREDIT_OVER_LIMIT), or not that much credit (CREDIT_NOT_ENOUGH)",
      503: "Mail isn't set up, or the email failed (MAIL_UNAVAILABLE)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/credit/redemptions/{redemptionID}/confirm",
    operationId: "adminConfirmCreditRedemption",
    tag: "Admin",
    summary: "Confirm an in-store redemption",
    description:
      "Spends the credit once the customer's code matches. A wrong code uses one of 5 tries.",
    auth: "admin",
    request: {
      params: z.object({ redemptionID: Uuid }),
      ...body(schemas.CreditConfirmBodySchema),
    },
    success: { ...account, description: "Store credit used" },
    errors: {
      400: "Invalid body (VALIDATION_FAILED) or id (INVALID_REDEMPTION_ID)",
      404: "No such redemption (REDEMPTION_NOT_FOUND)",
      409: "A wrong code (CREDIT_CODE_INVALID), one expired, used or out of tries (CREDIT_CODE_EXPIRED), or not that much credit left (CREDIT_NOT_ENOUGH)",
    },
  });
}
