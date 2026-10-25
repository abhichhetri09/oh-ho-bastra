import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

export function registerContactPaths() {
  operation({
    method: "post",
    path: "/api/v1/contact",
    operationId: "sendContactMessage",
    tag: "Contact",
    summary: "Send a message to the store",
    description:
      "Emails the message to the store's business email (or every admin when none is set), with Reply-To set to the sender. At most 5 messages an hour per address.",
    request: body(schemas.ContactBodySchema),
    success: {
      status: 202,
      description: "The message was sent",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      429: "Too many messages from this address (TOO_MANY_REQUESTS); see Retry-After",
      503: "Mail isn't configured or the send failed (MAIL_UNAVAILABLE)",
    },
  });
}
