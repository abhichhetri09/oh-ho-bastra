import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db/index.ts";
import * as authSchema from "./db/auth-schema.ts";

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: ["http://localhost:5173", frontendUrl],
});
