import { fromNodeHeaders } from "better-auth/node";
import type { Request, RequestHandler, Response } from "express";
import { auth } from "./auth.ts";
import { HttpError } from "./http-error.ts";

export async function sessionUser(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return session?.user ?? null;
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof sessionUser>>>;

export const requireUser: RequestHandler = async (req, res, next) => {
  const user = await sessionUser(req);
  if (!user) {
    throw new HttpError(401, "Sign in first");
  }
  res.locals.user = user;
  next();
};

/** The signed-in user for this request (set by requireUser). */
export function currentUser(res: Response): SessionUser {
  return res.locals.user as SessionUser;
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = await sessionUser(req);
  if (!user) {
    throw new HttpError(401, "Sign in first");
  }
  if (user.role !== "admin") {
    throw new HttpError(403, "Admins only");
  }
  res.locals.admin = user;
  next();
};

/** The admin making this request (set by requireAdmin). */
export function currentAdmin(res: Response): SessionUser {
  return res.locals.admin as SessionUser;
}
