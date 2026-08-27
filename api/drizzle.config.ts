import { defineConfig } from "drizzle-kit";
import "./src/load-env.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in the repo-root .env");
}

export default defineConfig({
  out: "./drizzle",
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
