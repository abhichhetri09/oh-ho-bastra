import { buildApp } from "./app";
import { CheckoutService } from "./checkout/service";
import {
  loadConfig,
  loadEnvFile,
  mailEnabled,
  validateAuth,
  validateMail,
} from "./config";
import { connectWithRetry } from "./db/pool";
import type { Deps } from "./deps";
import { createMailer } from "./emails/mailer";
import { EmailWorker } from "./emails/worker";
import { startBackgroundJobs } from "./jobs";
import { log } from "./log";
import { createCloudinary } from "./services/cloudinary";
import { createPayments } from "./services/payments";

async function main() {
  loadEnvFile();
  const cfg = loadConfig();
  validateAuth(cfg);
  validateMail(cfg);
  if (!cfg.databaseUrl) throw new Error("config: DATABASE_URL is required");

  const db = await connectWithRetry(cfg.databaseUrl);

  // Payments are off without a Stripe key or FRONTEND_URL (the checkout
  // return pages need it); the API still runs, and checkout answers 503.
  let payments = null;
  if (!cfg.stripeSecretKey)
    log.warn("payments disabled: STRIPE_SECRET_KEY is not set");
  else if (!cfg.frontendUrl)
    log.warn(
      "payments disabled: FRONTEND_URL is needed for the checkout return pages",
    );
  else payments = createPayments(cfg);

  // Without SMTP_HOST, order emails stay queued (those under two days old go
  // out once mail is set up) and password reset answers 503.
  const mailer = mailEnabled(cfg) ? createMailer(cfg) : null;
  if (!mailer)
    log.warn("order emails disabled: SMTP_HOST is not set (they stay queued)");
  else if (!cfg.frontendUrl)
    log.warn(
      "order emails: FRONTEND_URL is not set, so their order links won't work",
    );

  const deps: Deps = {
    cfg,
    db,
    cloudinary: createCloudinary(cfg),
    payments,
    checkout: new CheckoutService(db, payments, cfg.frontendUrl),
    mailer,
  };
  const { app } = buildApp(deps);
  const stopJobs = startBackgroundJobs(
    deps,
    mailer ? new EmailWorker(db, mailer, cfg.frontendUrl) : null,
  );

  const server = app.listen(cfg.port, () =>
    log.info("server listening", { addr: `:${cfg.port}` }),
  );
  server.headersTimeout = 10_000;

  // Serves until SIGINT/SIGTERM, then finishes in-flight requests, lets the
  // email sender record a send in flight, and closes the database.
  const shutdown = () => {
    log.info("shutting down...");
    const force = setTimeout(() => {
      log.warn("shutdown timed out");
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close(async () => {
      await stopJobs();
      await db.end().catch(() => {});
      log.info("server stopped");
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("startup failed", err);
  process.exit(1);
});
