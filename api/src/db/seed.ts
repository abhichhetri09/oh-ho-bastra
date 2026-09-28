import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { uploadsDir, uploadsUrl } from "../uploads.ts";
import { db } from "./index.ts";
import { replaceImages } from "./product-images.ts";
import { collection, product, productVariant } from "./schema.ts";

// Usage: npm run db:seed            upsert the catalog (keeps stock of existing sizes)
//        npm run db:reset-catalog   delete every product, size, photo and collection first
// Orders are never touched: their lines keep their own name, price and photo.
const reset = process.argv.includes("--reset");

const seedImages = resolve(dirname(fileURLToPath(import.meta.url)), "../../seed/images");
const photo = (name: string) => `${uploadsUrl}/seed/${name}.jpg`;

const collections = [
  {
    slug: "tees",
    name: "Tees",
    description: "Heavyweight cotton, a few colours.",
    blurb: "Plain tees in 220 gsm cotton. Regular and boxy cuts, no print.",
    imageUrl: photo("rack-colours"),
  },
  {
    slug: "long-sleeves",
    name: "Long sleeves",
    description: "For the colder half of the year.",
    blurb: "The same soft cotton with long sleeves and ribbed cuffs.",
    imageUrl: photo("white-long-sleeve"),
  },
  {
    slug: "custom",
    name: "Custom",
    description: "Your print or your words.",
    blurb: "Our tees, printed to order. Send art or a line of text after checkout.",
    imageUrl: photo("custom-text"),
  },
];

const heavyweight = {
  fabric: "100% organic cotton jersey",
  fit: "Regular",
  weight: "220 gsm",
  care: "Wash at 40 °C, inside out",
};

type Size = { size: string; stock: number; price?: number };
const sizes = (stock: number[], labels = ["S", "M", "L", "XL"]): Size[] =>
  labels.map((size, i) => ({ size, stock: stock[i] ?? 0 }));

const products: {
  slug: string;
  collection: string;
  name: string;
  description: string;
  color: string;
  priceCents: number;
  images: { name: string; alt: string }[];
  variants: Size[];
  fabric?: string;
  fit?: string;
  weight?: string;
  care?: string;
}[] = [
  {
    slug: "heavyweight-black",
    collection: "tees",
    name: "Heavyweight Tee — Black",
    color: "Black",
    priceCents: 2900,
    description: "A thick black tee with a clean neck and a bit of weight. Everyday, no print.",
    images: [
      { name: "black-hanger", alt: "Black heavyweight tee on a wooden hanger" },
      { name: "black-mint-folded", alt: "Black tee folded next to a mint tee" },
    ],
    variants: sizes([12, 20, 18, 9]),
  },
  {
    slug: "heavyweight-white",
    collection: "tees",
    name: "Heavyweight Tee — White",
    color: "White",
    priceCents: 2900,
    description: "Bright white, heavy enough not to be see-through. Softens with every wash.",
    images: [
      { name: "white-flat", alt: "White heavyweight tee laid flat" },
      { name: "white-hanger", alt: "White tee on a wooden hanger" },
    ],
    variants: sizes([10, 22, 20, 12]),
  },
  {
    slug: "heavyweight-ecru",
    collection: "tees",
    name: "Heavyweight Tee — Ecru",
    color: "Ecru",
    priceCents: 2900,
    description: "Undyed cotton in a warm off-white. Same cut, same weight.",
    images: [
      { name: "ecru-hanger", alt: "Ecru tee hanging against a pale wall" },
      { name: "white-concrete", alt: "Light tee hanging in front of a concrete wall" },
    ],
    variants: sizes([6, 14, 12, 4]),
  },
  {
    slug: "heavyweight-mint",
    collection: "tees",
    name: "Heavyweight Tee — Mint",
    color: "Mint",
    priceCents: 2900,
    description: "A soft, washed mint green. Easy with denim or black.",
    images: [
      { name: "mint-folded", alt: "Mint green tee folded with a cotton sprig" },
      { name: "mint-black-folded", alt: "Mint tee folded on top of a black tee" },
    ],
    variants: sizes([5, 11, 9, 3]),
  },
  {
    slug: "heather-blue",
    collection: "tees",
    name: "Everyday Tee — Heather Blue",
    color: "Heather blue",
    priceCents: 2500,
    description: "A lighter 180 gsm tee in a mottled heather blue. Breathes well in summer.",
    weight: "180 gsm",
    images: [{ name: "heather-blue-hanger", alt: "Heather blue tee on a hanger" }],
    variants: sizes([8, 15, 15, 7]),
  },
  {
    slug: "boxy-navy",
    collection: "tees",
    name: "Boxy Tee — Navy",
    color: "Navy",
    priceCents: 3200,
    description: "Shorter and wider, with a curved hem. Sits off the body without looking oversized.",
    fit: "Boxy",
    images: [{ name: "navy-flat", alt: "Navy boxy tee with a curved hem, laid flat" }],
    variants: sizes([4, 10, 10, 6, 3], ["S", "M", "L", "XL", "XXL"]).map((v) =>
      v.size === "XXL" ? { ...v, price: 3500 } : v,
    ),
  },
  {
    slug: "heavyweight-sage",
    collection: "tees",
    name: "Heavyweight Tee — Sage",
    color: "Sage",
    priceCents: 2900,
    description: "A muted grey-green that goes with everything. Garment dyed, so each one varies a little.",
    images: [{ name: "sage-rack", alt: "Sage green tees on wooden hangers" }],
    variants: sizes([7, 12, 12, 5]),
  },
  {
    slug: "long-sleeve-white",
    collection: "long-sleeves",
    name: "Long Sleeve — White",
    color: "White",
    priceCents: 3900,
    description: "A long-sleeve crew in soft brushed cotton, with ribbed cuffs and hem.",
    weight: "280 gsm",
    fit: "Relaxed",
    images: [{ name: "white-long-sleeve", alt: "White long-sleeve top laid flat with sneakers" }],
    variants: sizes([6, 10, 10, 6, 4], ["S", "M", "L", "XL", "XXL"]).map((v) =>
      v.size === "XL" ? { ...v, price: 4200 } : v.size === "XXL" ? { ...v, price: 4500 } : v,
    ),
  },
  {
    slug: "custom-text",
    collection: "custom",
    name: "Custom Text Tee",
    color: "White",
    priceCents: 3500,
    description: "A line of type on our heavyweight tee — a name, a date or a short mark. Send the words after you order.",
    images: [
      { name: "custom-text", alt: "White tee with bold printed text" },
      { name: "white-flat", alt: "Blank white tee before printing" },
    ],
    variants: sizes([20, 30, 30, 20]),
  },
  {
    slug: "custom-print",
    collection: "custom",
    name: "Custom Print Tee",
    color: "Your choice",
    priceCents: 3900,
    description: "Your art on any of our tees. One colour or full print — send the file after you order.",
    images: [
      { name: "rack-colours", alt: "Tees in several colours on a rail" },
      { name: "white-hanger", alt: "Blank white tee ready for printing" },
    ],
    variants: sizes([20, 30, 30, 20, 10], ["S", "M", "L", "XL", "XXL"]).map((v) =>
      v.size === "XXL" ? { ...v, price: 4400 } : v,
    ),
  },
];

async function seed() {
  // Seed photos are served like any upload.
  await mkdir(uploadsDir, { recursive: true });
  await cp(seedImages, resolve(uploadsDir, "seed"), { recursive: true, filter: (src) => !src.endsWith(".md") });

  await db.transaction(async (tx) => {
    if (reset) {
      // Photos and sizes go with their product (cascade); order lines keep their snapshot.
      await tx.delete(product);
      await tx.delete(collection);
    }

    const collectionIds = new Map<string, number>();
    for (const [sortOrder, item] of collections.entries()) {
      const [row] = await tx
        .insert(collection)
        .values({ ...item, sortOrder })
        .onConflictDoUpdate({ target: collection.slug, set: { ...item, sortOrder } })
        .returning({ id: collection.id });
      collectionIds.set(item.slug, row.id);
    }

    for (const [sortOrder, p] of products.entries()) {
      const { collection: collectionSlug, images, variants, ...item } = p;
      const collectionId = collectionIds.get(collectionSlug);
      if (!collectionId) throw new Error(`Unknown collection "${collectionSlug}" for ${p.slug}`);
      const values = { ...heavyweight, ...item, collectionId, sortOrder, swatch: null };
      const [row] = await tx
        .insert(product)
        .values(values)
        .onConflictDoUpdate({ target: product.slug, set: values })
        .returning({ id: product.id });

      await replaceImages(
        tx,
        row.id,
        images.map(({ name, alt }) => ({ url: photo(name), alt })),
      );
      for (const [index, v] of variants.entries()) {
        await tx
          .insert(productVariant)
          .values({
            productId: row.id,
            size: v.size,
            sku: `${p.slug}-${v.size}`.toUpperCase(),
            stock: v.stock,
            priceCents: v.price ?? null,
            sortOrder: index,
          })
          // Re-seeding keeps the stock you've set; price and order follow the seed.
          .onConflictDoUpdate({
            target: productVariant.sku,
            set: { priceCents: v.price ?? null, sortOrder: sql`excluded.sort_order` },
          });
      }
    }

    // Collections no longer in the seed (only when not resetting, e.g. an old one with no products).
    if (!reset) {
      const keep = new Set(collections.map((c) => c.slug));
      for (const old of await tx.select({ id: collection.id, slug: collection.slug }).from(collection)) {
        if (keep.has(old.slug)) continue;
        const [inUse] = await tx.select({ id: product.id }).from(product).where(eq(product.collectionId, old.id)).limit(1);
        if (!inUse) await tx.delete(collection).where(eq(collection.id, old.id));
      }
    }
  });

  console.log(
    `${reset ? "Reset and seeded" : "Seeded"} ${collections.length} collections and ${products.length} products.`,
  );
}

await seed();
process.exit(0);
