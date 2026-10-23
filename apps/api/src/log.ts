import type { Request } from "express";

// Logs as JSON lines in production and as readable text otherwise. Request
// logs carry the path, method, ip, request id and the signed-in user.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const json = process.env.NODE_ENV === "production";
const quiet = process.env.LOG_LEVEL === "silent";

function render(value: unknown): unknown {
  if (value instanceof Error) {
    return json
      ? { message: value.message, stack: value.stack }
      : (value.stack ?? value.message);
  }
  return value;
}

function write(level: Level, msg: string, fields: Fields = {}) {
  if (quiet) return;
  const time = new Date().toISOString();
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (json) {
    const out: Fields = { time, level, msg };
    for (const [k, v] of Object.entries(fields)) out[k] = render(v);
    stream.write(JSON.stringify(out) + "\n");
    return;
  }
  const parts = Object.entries(fields).map(([k, v]) => {
    const r = render(v);
    return `${k}=${typeof r === "string" && !/\s/.test(r) ? r : JSON.stringify(r)}`;
  });
  stream.write(
    `${time} ${level.toUpperCase()} ${msg}${parts.length ? " " + parts.join(" ") : ""}\n`,
  );
}

export const log = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, err: unknown, fields?: Fields) =>
    write("error", msg, { ...fields, error: err }),
};

function requestFields(req: Request, extra?: Fields): Fields {
  const fields: Fields = {
    path: req.route?.path ? req.baseUrl + req.route.path : req.path,
    method: req.method,
    ip: req.ip,
  };
  if (req.requestId) fields.request_id = req.requestId;
  if (req.auth) fields.actor_id = req.auth.userId;
  return { ...fields, ...extra };
}

/** Logs with the request's context (path, method, ip, request id, user). */
export const rlog = {
  info: (req: Request, msg: string, extra?: Fields) =>
    write("info", msg, requestFields(req, extra)),
  warn: (req: Request, msg: string, extra?: Fields) =>
    write("warn", msg, requestFields(req, extra)),
  error: (req: Request, msg: string, err: unknown, extra?: Fields) =>
    write("error", msg, requestFields(req, { ...extra, error: err })),
};
