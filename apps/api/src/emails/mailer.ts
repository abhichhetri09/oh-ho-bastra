import nodemailer from "nodemailer";
import type { Config } from "../config";
import { log } from "../log";

/** One email to one recipient. */
export interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies go, when not the From address (a contact form's sender). */
  replyTo?: string;
}

/** Delivers an email; rejects on failure. */
export interface Mailer {
  send(msg: Message): Promise<void>;
}

/**
 * A send the server refused for good (an SMTP 5xx such as an unknown
 * mailbox), so retrying can't help.
 */
export class PermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermanentError";
  }
}

const SMTP_TIMEOUT = 30_000;

/** What nodemailer adds to the errors it raises. */
interface SmtpError extends Error {
  code?: string;
  command?: string;
  responseCode?: number;
}

/** Commands of the transaction proper, after the connection is up and logged in. */
const SEND_COMMANDS = new Set(["MAIL FROM", "RCPT TO", "DATA"]);

/**
 * The SMTP mailer, or null without SMTP_HOST (mail is off). It sends through
 * any SMTP server: a provider (Resend, Postmark, SES...) in production,
 * Mailpit in development. cfg must have passed validateMail.
 */
export function createMailer(cfg: Config): Mailer | null {
  if (!cfg.smtpHost) return null;
  const noTls = cfg.smtpTls === "none";
  // Never send a login over an unencrypted connection: with SMTP_TLS=none
  // (Mailpit in development) the credentials are left out, so a .env
  // holding a real provider's login still reaches the local catcher.
  if (cfg.smtpUsername && noTls) {
    log.warn(
      "SMTP_TLS=none: SMTP_USERNAME/SMTP_PASSWORD are not sent over an unencrypted connection",
    );
  }
  // A new connection per email, as the Go sender dialled one per send.
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpTls === "tls", // implicit TLS
    requireTLS: cfg.smtpTls === "starttls", // the STARTTLS upgrade is mandatory
    ignoreTLS: noTls,
    connectionTimeout: SMTP_TIMEOUT,
    greetingTimeout: SMTP_TIMEOUT,
    socketTimeout: SMTP_TIMEOUT,
    auth:
      cfg.smtpUsername && !noTls
        ? { user: cfg.smtpUsername, pass: cfg.smtpPassword }
        : undefined,
  });

  return {
    async send(m) {
      try {
        await transport.sendMail({
          from: cfg.mailFrom,
          to: m.to,
          subject: m.subject,
          text: m.text,
          html: m.html,
          replyTo: m.replyTo,
        });
      } catch (e) {
        const err = e as SmtpError;
        const message = err instanceof Error ? err.message : String(e);
        // A sender or recipient nodemailer can't use, refused before any command.
        if (err.code === "EENVELOPE" && err.command === "API")
          throw new PermanentError(message, { cause: e });
        if (err.command && SEND_COMMANDS.has(err.command)) {
          if ((err.responseCode ?? 0) >= 500)
            throw new PermanentError(message, { cause: e });
          throw new Error(`send: ${message}`, { cause: e });
        }
        // Connecting, the greeting, STARTTLS or the login: retried.
        throw new Error(`dial: ${message}`, { cause: e });
      }
    },
  };
}
