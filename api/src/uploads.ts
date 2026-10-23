import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import { HttpError } from "./http-error.ts";

// api/uploads, served at /api/uploads (the Vite dev server proxies /api).
export const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");
export const uploadsUrl = "/api/uploads";

const MAX_BYTES = 8 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const serveUploads = express.static(uploadsDir, {
  // File names are random and never reused, so they can be cached for good.
  immutable: true,
  maxAge: "365d",
  fallthrough: false,
});

// Mounted behind requireAdmin. The body is the raw image; no multipart parser needed.
export const adminUploads = Router();

adminUploads.post(
  "/uploads",
  express.raw({ type: Object.keys(extensions), limit: MAX_BYTES }),
  async (req, res) => {
    const ext = extensions[req.headers["content-type"] ?? ""];
    if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(415, "Upload a JPEG, PNG, WebP or AVIF image");
    }
    const name = `${randomUUID()}.${ext}`;
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(resolve(uploadsDir, name), req.body);
    res.status(201).json({ url: `${uploadsUrl}/${name}` });
  },
);
