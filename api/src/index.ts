import cors from "cors";
import express, { Router } from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.ts";
import { db } from "./db/index.ts";
import "./load-env.ts";

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = [...new Set(["http://localhost:5173", frontendUrl])];

const app = express();
const v1 = Router();

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());
app.use("/api/v1", v1);

v1.get("/health", async (_req, res) => {
  const result = await db.execute("select 1");
  res.status(200).json({ message: "API is running.", result });
});

v1.get("/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  res.json(session);
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
