import { createHash } from "node:crypto";
import type { Config } from "../config";

// Port of internal/pkg/cloudinary: signed direct uploads from the admin's
// browser, and deleting the images of deleted products.

/** Where admin uploads land; only images in it are ever deleted. */
export const PRODUCT_FOLDER = "ohhobastra/products";

/**
 * The image formats an upload may have. Being signed, Cloudinary enforces
 * them, not just the admin's file picker.
 */
export const PRODUCT_FORMATS = "jpg,png,webp,avif";

/**
 * Lets a browser upload straight to Cloudinary: the signed parameters
 * (allowed formats, folder and timestamp) plus what the upload form needs.
 * The form must send every signed parameter as is.
 */
export interface UploadSignature {
  cloud_name: string;
  api_key: string;
  allowed_formats: string;
  folder: string;
  timestamp: number;
  signature: string;
}

export interface Cloudinary {
  /** A signature for one direct browser upload into folder. */
  signUpload(folder: string, timestamp: number): UploadSignature;
  /**
   * Whether an image is one of our product uploads: on this cloud, in
   * PRODUCT_FOLDER, under the public id it was stored with.
   */
  owns(imageUrl: string, publicId: string): boolean;
  deleteImage(publicId: string): Promise<void>;
}

/**
 * Cloudinary's request signature: SHA-1 (hex) of the params sorted by name
 * as "key=value&...", followed by the API secret. Values are not escaped.
 */
export function signParameters(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

/** How long one destroy call may take (Go gave the batch a minute). */
const DESTROY_TIMEOUT_MS = 60_000;

export class CloudinaryClient implements Cloudinary {
  constructor(
    private readonly cloudName: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {
    if (!cloudName || !apiKey || !apiSecret)
      throw new Error("cloudinary: missing required credentials");
  }

  /**
   * Signs an upload into folder at timestamp (Unix seconds); Cloudinary
   * rejects it an hour later, or if the file isn't one of PRODUCT_FORMATS.
   */
  signUpload(folder: string, timestamp: number): UploadSignature {
    const signature = signParameters(
      {
        allowed_formats: PRODUCT_FORMATS,
        folder,
        timestamp: String(timestamp),
      },
      this.apiSecret,
    );
    return {
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      allowed_formats: PRODUCT_FORMATS,
      folder,
      timestamp,
      signature,
    };
  }

  /**
   * Only our own uploads may be deleted. Other clouds' public ids (the demo
   * catalog's "samples/...") could name this cloud's own assets, and the
   * public id arrives separately from the URL, so it has to match it.
   */
  owns(imageUrl: string, publicId: string): boolean {
    return (
      imageUrl.startsWith(
        `https://res.cloudinary.com/${this.cloudName}/image/upload/`,
      ) &&
      publicId.startsWith(`${PRODUCT_FOLDER}/`) &&
      imageUrl.includes(`/${publicId}.`)
    );
  }

  /** A signed destroy of one uploaded image (Upload API). */
  async deleteImage(publicId: string): Promise<void> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const form = new URLSearchParams({
      public_id: publicId,
      timestamp,
      api_key: this.apiKey,
      signature: signParameters(
        { public_id: publicId, timestamp },
        this.apiSecret,
      ),
    });
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/destroy`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(DESTROY_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `cloudinary: destroy ${publicId}: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
  }
}

/** The client for cfg's credentials; startup fails without them, as in Go. */
export function createCloudinary(cfg: Config): Cloudinary {
  try {
    return new CloudinaryClient(
      cfg.cloudinaryCloudName,
      cfg.cloudinaryApiKey,
      cfg.cloudinaryApiSecret,
    );
  } catch (err) {
    throw new Error(
      `cloudinary: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
