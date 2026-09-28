import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { Router, type Request } from "express";
import { z } from "zod";
import { auth } from "../../auth.ts";
import { account, session, user } from "../../db/auth-schema.ts";
import { db } from "../../db/index.ts";
import { order } from "../../db/schema.ts";
import { HttpError } from "../../http-error.ts";
import { currentAdmin } from "../../session.ts";
import { paged, pageQuery } from "../../pagination.ts";
import { orderListColumns } from "./shared.ts";

export const adminUsers = Router();

export const roles = ["customer", "admin"] as const;

// Per-user order stats. Only paid/shipped orders count towards spend.
const orderCount = sql<number>`(select count(*)::int from "order" o where o.user_id = "user"."id")`;
const totalSpent = sql<number>`(select coalesce(sum(o.total_cents), 0)::int from "order" o where o.user_id = "user"."id" and o.status in ('paid', 'fulfilled'))`;
const lastOrderAt = sql<string | null>`(select max(o.created_at) from "order" o where o.user_id = "user"."id")`;

const userColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
  orderCount,
  totalSpentCents: totalSpent,
  lastOrderAt,
};

const listQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(roles).optional(),
  status: z.enum(["active", "banned"]).optional(),
});

adminUsers.get("/users", async (req, res) => {
  const { q, role, status, page, pageSize } = listQuery.parse(req.query);
  const where = and(
    q ? or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)) : undefined,
    role ? eq(user.role, role) : undefined,
    status ? eq(user.banned, status === "banned") : undefined,
  );
  const [rows, [{ total }], [counts]] = await Promise.all([
    db
      .select(userColumns)
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(user).where(where),
    db
      .select({
        all: sql<number>`count(*)::int`,
        admins: sql<number>`count(*) filter (where ${user.role} = 'admin')::int`,
        banned: sql<number>`count(*) filter (where ${user.banned})::int`,
      })
      .from(user),
  ]);
  res.json({ ...paged(rows, total, page, pageSize), counts });
});

adminUsers.get("/users/:id", async (req, res) => {
  const [row] = await db.select(userColumns).from(user).where(eq(user.id, req.params.id));
  if (!row) {
    throw new HttpError(404, "User not found");
  }
  const [orders, sessions, providers] = await Promise.all([
    db.select(orderListColumns).from(order).where(eq(order.userId, row.id)).orderBy(desc(order.createdAt)).limit(50),
    db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(and(eq(session.userId, row.id), sql`${session.expiresAt} > now()`))
      .orderBy(desc(session.createdAt)),
    db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, row.id)),
  ]);
  res.json({
    ...row,
    orders,
    sessions,
    providers: providers.map((p) => p.providerId),
    isSelf: row.id === currentAdmin(res).id,
  });
});

const headers = (req: Request) => fromNodeHeaders(req.headers);

/** Refuses changes that would leave the store without an active admin. */
async function assertAnotherAdmin(userId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false), ne(user.id, userId)));
  if (count === 0) {
    throw new HttpError(409, "This is the only active admin. Make someone else an admin first.");
  }
}

async function findUser(id: string) {
  const [row] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id));
  if (!row) {
    throw new HttpError(404, "User not found");
  }
  return row;
}

const roleBody = z.object({ role: z.enum(roles) });

adminUsers.post("/users/:id/role", async (req, res) => {
  const { role } = roleBody.parse(req.body);
  const target = await findUser(req.params.id);
  if (target.id === currentAdmin(res).id && role !== "admin") {
    throw new HttpError(409, "You can’t remove your own admin access.");
  }
  if (target.role === "admin" && role !== "admin") {
    await assertAnotherAdmin(target.id);
  }
  // Plugin types only know its default role names; "customer" is our default.
  await auth.api.setRole({ body: { userId: target.id, role: role as "admin" }, headers: headers(req) });
  res.json({ id: target.id, role });
});

const banBody = z.object({
  reason: z.string().trim().max(300).optional(),
  // Omit for a permanent ban.
  days: z.number().int().min(1).max(3650).optional(),
});

adminUsers.post("/users/:id/ban", async (req, res) => {
  const { reason, days } = banBody.parse(req.body);
  const target = await findUser(req.params.id);
  if (target.id === currentAdmin(res).id) {
    throw new HttpError(409, "You can’t ban yourself.");
  }
  if (target.role === "admin") {
    await assertAnotherAdmin(target.id);
  }
  // Also signs the user out everywhere.
  await auth.api.banUser({
    body: { userId: target.id, banReason: reason, banExpiresIn: days ? days * 86_400 : undefined },
    headers: headers(req),
  });
  res.json({ id: target.id, banned: true });
});

adminUsers.post("/users/:id/unban", async (req, res) => {
  const target = await findUser(req.params.id);
  await auth.api.unbanUser({ body: { userId: target.id }, headers: headers(req) });
  res.json({ id: target.id, banned: false });
});

adminUsers.post("/users/:id/revoke-sessions", async (req, res) => {
  const target = await findUser(req.params.id);
  if (target.id === currentAdmin(res).id) {
    throw new HttpError(409, "Sign out from your own account menu instead.");
  }
  await auth.api.revokeUserSessions({ body: { userId: target.id }, headers: headers(req) });
  res.json({ id: target.id });
});
