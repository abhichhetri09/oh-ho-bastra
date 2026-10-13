import { z } from "zod";
import type { UploadSignature } from "@repo/types";

/** An image as products and variants store it: its URL and public ID. */
export type StoredImage = { url: string; public_id: string };

/** Cloudinary's own limit for images on the free plan. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/avif";

const UploadResultSchema = z.object({
  secure_url: z.url(),
  public_id: z.string().min(1),
});

/** Why a file can't be uploaded, or null when it can. */
export function rejectImage(file: File): string | null {
  if (!ACCEPTED_IMAGES.split(",").includes(file.type)) {
    return `${file.name} isn't a JPEG, PNG, WebP or AVIF image`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is over 10 MB`;
  }
  return null;
}

/**
 * Uploads one file straight from the browser to Cloudinary with a signature
 * from the API (the API secret never leaves the server). XHR rather than
 * fetch, for upload progress.
 */
export function uploadImage(
  file: File,
  sig: UploadSignature,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sig.api_key);
    form.append("allowed_formats", sig.allowed_formats);
    form.append("timestamp", String(sig.timestamp));
    form.append("folder", sig.folder);
    form.append("signature", sig.signature);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloud_name)}/image/upload`,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      const parsed = UploadResultSchema.safeParse(body);
      if (xhr.status >= 200 && xhr.status < 300 && parsed.success) {
        resolve({
          url: parsed.data.secure_url,
          public_id: parsed.data.public_id,
        });
        return;
      }
      reject(new Error(cloudinaryMessage(body) ?? "The upload failed"));
    };
    xhr.onerror = () => reject(new Error("The upload failed"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

function cloudinaryMessage(body: unknown): string | undefined {
  const parsed = z
    .object({ error: z.object({ message: z.string() }) })
    .safeParse(body);
  return parsed.success ? parsed.data.error.message : undefined;
}

/** Moves the item at `from` to `to`, returning a new array. */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
