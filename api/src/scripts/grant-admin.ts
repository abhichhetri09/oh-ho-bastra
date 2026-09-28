import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { user } from "../db/auth-schema.ts";

// Usage: npm run admin:grant -- someone@example.fi [--revoke]
const email = process.argv[2];
const role = process.argv.includes("--revoke") ? "customer" : "admin";

if (!email) {
  console.error("Usage: npm run admin:grant -- <email> [--revoke]");
  process.exit(1);
}

const [updated] = await db
  .update(user)
  .set({ role })
  .where(eq(user.email, email.toLowerCase()))
  .returning({ email: user.email, role: user.role });

if (!updated) {
  console.error(`No user with email ${email}. Sign up first.`);
  process.exit(1);
}
console.log(`${updated.email} is now ${updated.role}.`);
process.exit(0);
