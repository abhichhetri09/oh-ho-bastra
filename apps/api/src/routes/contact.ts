import { CONTACT_TOPIC_LABELS, ContactBodySchema } from "@repo/types";
import { getStoreSettings, listAdminEmails } from "../db/gen";
import type { Deps } from "../deps";
import { STORE_NAME } from "../emails/render";
import { contactHtml, contactText } from "../emails/templates";
import { contactLimit } from "../http/rate-limit";
import { fail, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { rlog } from "../log";

// The storefront's contact form. A message goes straight to the store by
// email: to the business email in Admin → Settings → Business, or to every
// admin when that's empty. Replying answers the shopper (Reply-To).
export function contactRoutes(api: Group, deps: Deps) {
  const { db, cfg, mailer } = deps;
  const limit = contactLimit(cfg.authRateLimits);

  api.post("/contact", limit, async (req, res) => {
    const body = parseBody(ContactBodySchema, req, res);
    if (!body) return;
    // The hidden field only bots fill in: look sent, send nothing.
    if (body.website) {
      rlog.info(req, "contact message dropped: honeypot filled");
      ok(res, 202, "Thanks, your message is on its way");
      return;
    }
    if (!mailer) {
      rlog.warn(req, "contact message, but mail is not set up");
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "Messages can't be sent right now. Please email us directly.",
      );
      return;
    }

    const settings = await getStoreSettings(db);
    const to = settings?.business_email
      ? [settings.business_email]
      : (await listAdminEmails(db)).map((a) => a.email);
    if (to.length === 0) {
      rlog.warn(req, "contact message, but no business email or admin");
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "Messages can't be sent right now. Please email us directly.",
      );
      return;
    }

    const topic = CONTACT_TOPIC_LABELS[body.topic];
    const view = {
      storeName: STORE_NAME,
      shopUrl: cfg.frontendUrl.replace(/\/+$/, ""),
      topic,
      name: body.name,
      email: body.email,
      orderNumber: body.order_number ?? "",
      message: body.message,
    };
    const subject = `Contact: ${topic}${body.order_number ? ` (${body.order_number})` : ""}, from ${body.name}`;
    try {
      for (const recipient of to) {
        await mailer.send({
          to: recipient,
          replyTo: body.email,
          subject,
          html: contactHtml(view),
          text: contactText(view),
        });
      }
    } catch (err) {
      rlog.error(req, "contact message: send failed", err);
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "We couldn't send your message. Please try again, or email us directly.",
      );
      return;
    }
    rlog.info(req, "contact message sent", { topic: body.topic });
    ok(res, 202, "Thanks, your message is on its way");
  });
}
