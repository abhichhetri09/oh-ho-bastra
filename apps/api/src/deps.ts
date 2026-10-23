import type { CheckoutService } from "./checkout/service";
import type { Config } from "./config";
import type { Pool } from "./db/pool";
import type { Mailer } from "./emails/mailer";
import type { Cloudinary } from "./services/cloudinary";
import type { PaymentProvider } from "./services/payments";

/**
 * What route modules get. Services that are off without configuration are
 * null then, and the routes that need them answer 503: payments
 * (PAYMENTS_UNAVAILABLE) and mail (MAIL_UNAVAILABLE).
 */
export interface Deps {
  cfg: Config;
  db: Pool;
  cloudinary: Cloudinary;
  payments: PaymentProvider | null;
  checkout: CheckoutService;
  mailer: Mailer | null;
}
