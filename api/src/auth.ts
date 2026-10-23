import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db/index.ts";
import * as authSchema from "./db/auth-schema.ts";

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
  },
  plugins: [
    // Adds role + ban fields, blocks sign-in for banned users, and exposes
    // setRole / banUser / revokeUserSessions for the admin API.
    admin({ defaultRole: "customer", adminRoles: ["admin"] }),
  ],
  trustedOrigins: ["http://localhost:5173", frontendUrl],
});
