import cors from "cors";
import dotenv from "dotenv";
import express, { Router } from "express";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(root, ".env") });
dotenv.config({ path: resolve(root, ".env.local") });

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = ["http://localhost:5173", frontendUrl].filter(
  (value, index, arr) => arr.indexOf(value) === index,
);

const app = express();
const v1 = Router();
const db = drizzle(process.env.DATABASE_URL!);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use("/api/v1", v1);

v1.get("/health", (_req, res) => {
  res.status(200).json({ message: "API is running." });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
