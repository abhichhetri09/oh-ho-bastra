#!/usr/bin/env bun
/**
 * Seeds the Oh Ho Bastra catalog through the running API as the seeded
 * admin, so it goes through the same validation, slug, SKU and option logic
 * as the admin endpoints. Idempotent: categories and products that already
 * exist (by name) are skipped.
 *
 *   bun run db:seed && bun run db:seed:catalog
 *
 * Needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (root .env.local), the API at
 * SEED_API_URL (default NEXT_PUBLIC_API_URL), and Cloudinary configured on
 * the API: the photos in scripts/catalog-images (credits in CREDITS.md
 * there) are uploaded to the store's own cloud with an admin upload
 * signature, like images added in the admin.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Relative imports: the root package doesn't depend on the workspace ones.
import {
  adminCreateCategory,
  adminCreateProduct,
  adminCreateVariant,
  adminListCategories,
  adminListProducts,
  adminSignUpload,
  createServerClient,
  login,
  type Client,
  type CreateVariantBody,
  type UploadSignature,
} from "../packages/api-client/src/server.ts";

const IMAGES = fileURLToPath(new URL("catalog-images", import.meta.url));

type SeedVariant = Omit<CreateVariantBody, "images" | "image_public_ids">;

type SeedProduct = {
  name: string;
  category: string;
  /** File names in scripts/catalog-images, without ".jpg". */
  images: string[];
  description: string;
  features: string[];
  is_featured?: boolean;
  variants: SeedVariant[];
};

// [name, parent]
const categories: [string, string | null][] = [
  ["Tees", null],
  ["Short sleeve", "Tees"],
  ["Long sleeve", "Tees"],
  ["Custom", null],
  ["Custom text", "Custom"],
  ["Custom print", "Custom"],
];

const size = (value: string) => ({
  name: "size",
  value,
  type: "text" as const,
});
const color = (value: string) => ({
  name: "color",
  value,
  type: "color" as const,
});

const HEAVYWEIGHT = {
  fabric: "100% organic cotton jersey",
  fit: "Regular fit",
  weight: "220 gsm",
  care: "Wash at 40 °C, inside out",
};

function features(overrides: Partial<typeof HEAVYWEIGHT> = {}): string[] {
  return Object.values({ ...HEAVYWEIGHT, ...overrides });
}

/**
 * One active variant per size, with that size's stock. `prices` sets a
 * different price for some sizes (bigger sizes cost a little more).
 */
function sized(
  price: number,
  stock: Record<string, number>,
  opts: { colour?: string; prices?: Record<string, number> } = {},
): SeedVariant[] {
  const sizes = Object.keys(stock);
  return sizes.map((s, i) => ({
    selling_price: opts.prices?.[s] ?? price,
    stock: stock[s]!,
    is_default: i === Math.floor((sizes.length - 1) / 2),
    is_active: true,
    properties: opts.colour ? [size(s), color(opts.colour)] : [size(s)],
  }));
}

const products: SeedProduct[] = [
  // Short sleeve
  {
    name: "Heavyweight Tee — Black",
    category: "Short sleeve",
    images: ["black-hanger", "black-mint-folded"],
    description:
      "A thick black tee with a clean neck and a bit of weight. Everyday, no print.",
    features: features(),
    is_featured: true,
    variants: sized(2900, { S: 12, M: 20, L: 18, XL: 9 }, { colour: "Black" }),
  },
  {
    name: "Heavyweight Tee — White",
    category: "Short sleeve",
    images: ["white-flat", "white-hanger"],
    description:
      "Bright white, heavy enough not to be see-through. Softens with every wash.",
    features: features(),
    is_featured: true,
    variants: sized(2900, { S: 10, M: 22, L: 20, XL: 12 }, { colour: "White" }),
  },
  {
    name: "Heavyweight Tee — Ecru",
    category: "Short sleeve",
    images: ["ecru-hanger", "white-concrete"],
    description: "Undyed cotton in a warm off-white. Same cut, same weight.",
    features: features(),
    variants: sized(2900, { S: 6, M: 14, L: 12, XL: 4 }, { colour: "Ecru" }),
  },
  {
    name: "Heavyweight Tee — Mint",
    category: "Short sleeve",
    images: ["mint-folded", "mint-black-folded"],
    description: "A soft, washed mint green. Easy with denim or black.",
    features: features(),
    variants: sized(2900, { S: 5, M: 11, L: 9, XL: 3 }, { colour: "Mint" }),
  },
  {
    name: "Heavyweight Tee — Sage",
    category: "Short sleeve",
    images: ["sage-rack"],
    description:
      "A muted grey-green that goes with everything. Garment dyed, so each one varies a little.",
    features: features(),
    variants: sized(2900, { S: 7, M: 12, L: 12, XL: 5 }, { colour: "Sage" }),
  },
  {
    name: "Everyday Tee — Heather Blue",
    category: "Short sleeve",
    images: ["heather-blue-hanger"],
    description:
      "A lighter 180 gsm tee in a mottled heather blue. Breathes well in summer.",
    features: features({ weight: "180 gsm" }),
    variants: sized(
      2500,
      { S: 8, M: 15, L: 15, XL: 7 },
      { colour: "Heather blue" },
    ),
  },
  {
    name: "Boxy Tee — Navy",
    category: "Short sleeve",
    images: ["navy-flat"],
    description:
      "Shorter and wider, with a curved hem. Sits off the body without looking oversized.",
    features: features({ fit: "Boxy fit" }),
    is_featured: true,
    variants: sized(
      3200,
      { S: 4, M: 10, L: 10, XL: 6, XXL: 3 },
      { colour: "Navy", prices: { XXL: 3500 } },
    ),
  },
  // Long sleeve
  {
    name: "Long Sleeve — White",
    category: "Long sleeve",
    images: ["white-long-sleeve"],
    description:
      "A long-sleeve crew in soft brushed cotton, with ribbed cuffs and hem.",
    features: features({ fit: "Relaxed fit", weight: "280 gsm" }),
    variants: sized(
      3900,
      { S: 6, M: 10, L: 10, XL: 6, XXL: 4 },
      { colour: "White", prices: { XL: 4200, XXL: 4500 } },
    ),
  },
  // Custom
  {
    name: "Custom Text Tee",
    category: "Custom text",
    images: ["custom-text", "white-flat"],
    description:
      "A line of type on our heavyweight tee: a name, a date or a short mark. Send the words after you order.",
    features: [...features(), "Printed to order"],
    variants: sized(3500, { S: 20, M: 30, L: 30, XL: 20 }, { colour: "White" }),
  },
  {
    name: "Custom Print Tee",
    category: "Custom print",
    images: ["rack-colours", "white-hanger"],
    description:
      "Your art on any of our tees. One colour or full print: send the file after you order.",
    features: [...features(), "Printed to order"],
    is_featured: true,
    variants: sized(
      3900,
      { S: 20, M: 30, L: 30, XL: 20, XXL: 10 },
      { prices: { XXL: 4400 } },
    ),
  },
];

type StoredImage = { url: string; public_id: string };

function fail(step: string, error: unknown): never {
  throw new Error(`${step} failed: ${JSON.stringify(error)}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function signIn(baseUrl: string): Promise<Client> {
  const { data, error, response } = await login({
    client: createServerClient({ baseUrl }),
    body: {
      email: requireEnv("SEED_ADMIN_EMAIL"),
      password: requireEnv("SEED_ADMIN_PASSWORD"),
    },
  });
  if (!data) fail("login", error);
  if (data.data.role !== "admin")
    throw new Error("SEED_ADMIN_EMAIL is not an admin");

  const access = response.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0] ?? "")
    .find((c) => c.startsWith("access_token="));
  if (!access) throw new Error("login set no access_token cookie");
  return createServerClient({ baseUrl, headers: { cookie: access } });
}

/**
 * Uploads catalog photos to the store's Cloudinary, each file once per run
 * (several products share a photo). One signature covers the run: it is
 * valid for an hour.
 */
function imageUploader(client: Client) {
  let signature: Promise<UploadSignature> | undefined;
  const uploads = new Map<string, Promise<StoredImage>>();

  async function sign(): Promise<UploadSignature> {
    const { data, error } = await adminSignUpload({ client });
    if (!data) {
      throw new Error(
        `upload signature failed (are CLOUDINARY_* set for the API?): ${JSON.stringify(error)}`,
      );
    }
    return data.data;
  }

  async function upload(name: string): Promise<StoredImage> {
    const sig = await (signature ??= sign());
    const form = new FormData();
    const bytes = await readFile(join(IMAGES, `${name}.jpg`));
    form.append(
      "file",
      new Blob([bytes], { type: "image/jpeg" }),
      `${name}.jpg`,
    );
    form.append("api_key", sig.api_key);
    form.append("allowed_formats", sig.allowed_formats);
    form.append("timestamp", String(sig.timestamp));
    form.append("folder", sig.folder);
    form.append("signature", sig.signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloud_name)}/image/upload`,
      { method: "POST", body: form },
    );
    const body = (await res.json().catch(() => undefined)) as
      | { secure_url?: string; public_id?: string }
      | undefined;
    if (!res.ok || !body?.secure_url || !body.public_id) {
      fail(`upload ${name}.jpg`, body ?? res.status);
    }
    return { url: body.secure_url, public_id: body.public_id };
  }

  return (name: string): Promise<StoredImage> => {
    let image = uploads.get(name);
    if (!image) {
      image = upload(name);
      uploads.set(name, image);
    }
    return image;
  };
}

async function existingCategories(
  client: Client,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await adminListCategories({
      client,
      query: { page },
    });
    if (!data) fail("list categories", error);
    data.data.forEach((c) => byName.set(c.name, c.id));
    if (page >= data.meta.total_pages) return byName;
  }
}

async function existingProducts(client: Client): Promise<Set<string>> {
  const names = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await adminListProducts({
      client,
      query: { page },
    });
    if (!data) fail("list products", error);
    data.data.forEach((p) => names.add(p.name));
    if (page >= data.meta.total_pages) return names;
  }
}

async function main() {
  const baseUrl = process.env.SEED_API_URL || requireEnv("NEXT_PUBLIC_API_URL");
  const client = await signIn(baseUrl);
  const image = imageUploader(client);

  const categoryIds = await existingCategories(client);
  let createdCategories = 0;
  for (const [name, parent] of categories) {
    if (categoryIds.has(name)) continue;
    const parentId = parent ? categoryIds.get(parent) : undefined;
    const { data, error } = await adminCreateCategory({
      client,
      body: { name, ...(parentId ? { parent_id: parentId } : {}) },
    });
    if (!data) fail(`create category ${name}`, error);
    categoryIds.set(name, data.data.id);
    createdCategories++;
  }

  const productNames = await existingProducts(client);
  let createdProducts = 0;
  for (const p of products) {
    if (productNames.has(p.name)) continue;
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`unknown category ${p.category}`);

    const images = await Promise.all(p.images.map(image));
    const { data, error } = await adminCreateProduct({
      client,
      body: {
        name: p.name,
        description: p.description,
        features: p.features,
        category_id: categoryId,
        images: images.map((i) => i.url),
        image_public_ids: images.map((i) => i.public_id),
        is_active: true,
        is_featured: p.is_featured ?? false,
      },
    });
    if (!data) fail(`create product ${p.name}`, error);

    // Every size shows the product's first photo.
    const [cover] = images;
    for (const variant of p.variants) {
      const { error: variantError } = await adminCreateVariant({
        client,
        path: { productID: data.data.id },
        body: {
          ...variant,
          images: [cover!.url],
          image_public_ids: [cover!.public_id],
        },
      });
      if (variantError) fail(`create variant of ${p.name}`, variantError);
    }
    createdProducts++;
  }

  console.log(
    `catalog seeded: ${createdCategories} categories and ${createdProducts} products created`,
  );
}

await main();
