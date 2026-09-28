import type { ErrorRequestHandler } from "express";
import { APIError } from "better-auth/api";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.details });
    return;
  }
  if (err instanceof APIError) {
    res.status(err.statusCode).json({ error: err.body?.message ?? err.message });
    return;
  }
  if (err instanceof ZodError) {
    const [first] = err.issues;
    res.status(400).json({
      // Name the first problem so forms can show something useful.
      error: first ? `${first.path.join(".") || "Request"}: ${first.message}` : "Invalid request",
      issues: err.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "That file is too large (max 8 MB)" });
    return;
  }
  // Other client errors from middleware (e.g. a missing upload → 404).
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.expose ? err.message : "Not found" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};
