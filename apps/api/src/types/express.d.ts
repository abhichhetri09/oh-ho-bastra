import "express";

declare global {
  namespace Express {
    interface Request {
      /** Set by the requestId middleware; echoed as X-Request-ID. */
      requestId?: string;
      /** Set by requireAuth from a valid access token. */
      auth?: { userId: string; role: "customer" | "admin" };
      /** The JSON body as received, for signature checks (Stripe webhooks). */
      rawBody?: Buffer;
    }
  }
}
