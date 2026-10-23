import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deletableImages } from "../src/catalog-admin/products";
import { CloudinaryClient } from "../src/services/cloudinary";

describe("CloudinaryClient", () => {
  it("refuses missing credentials", () => {
    expect(() => new CloudinaryClient("ohhobastra", "", "s")).toThrow(
      "missing required credentials",
    );
  });

  it("signs an upload like Cloudinary", () => {
    const c = new CloudinaryClient("ohhobastra", "key-123", "secret-xyz");
    const got = c.signUpload("ohhobastra/products", 1760000000);
    // Cloudinary: sha1 of the sorted "key=value&..." params, then the secret.
    const want = createHash("sha1")
      .update(
        "allowed_formats=jpg,png,webp,avif&folder=ohhobastra/products&timestamp=1760000000secret-xyz",
      )
      .digest("hex");
    expect(got).toEqual({
      cloud_name: "ohhobastra",
      api_key: "key-123",
      allowed_formats: "jpg,png,webp,avif",
      folder: "ohhobastra/products",
      timestamp: 1760000000,
      signature: want,
    });
  });

  it("owns only its own product uploads", () => {
    const c = new CloudinaryClient("ohhobastra", "k", "s");
    const own =
      "https://res.cloudinary.com/ohhobastra/image/upload/v1/ohhobastra/products/a1.jpg";
    const cases: [string, string, boolean][] = [
      [own, "ohhobastra/products/a1", true],
      // another cloud, even with a public id that exists on ours
      [
        "https://res.cloudinary.com/demo/image/upload/samples/two-ladies.jpg",
        "samples/two-ladies",
        false,
      ],
      [
        "https://res.cloudinary.com/ohhobastra-evil/image/upload/ohhobastra/products/a1.jpg",
        "ohhobastra/products/a1",
        false,
      ],
      [
        "https://example.com/res.cloudinary.com/ohhobastra/image/upload/ohhobastra/products/a1.jpg",
        "ohhobastra/products/a1",
        false,
      ],
      // our URL, but a public id that isn't its own or isn't an upload of ours
      [own, "ohhobastra/products/b2", false],
      [own, "ohhobastra/products/a", false],
      [
        "https://res.cloudinary.com/ohhobastra/image/upload/v1/brand/logo.png",
        "brand/logo",
        false,
      ],
      [own, "", false],
    ];
    for (const [url, publicId, want] of cases) {
      expect(c.owns(url, publicId), `owns(${url}, ${publicId})`).toBe(want);
    }
  });
});

describe("deletableImages", () => {
  it("picks our own, unordered uploads once each", () => {
    const cld = new CloudinaryClient("ohhobastra", "k", "s");
    const base =
      "https://res.cloudinary.com/ohhobastra/image/upload/v1/ohhobastra/products/";
    const images = [
      { url: `${base}a.jpg`, public_id: "ohhobastra/products/a" },
      { url: `${base}b.jpg`, public_id: "ohhobastra/products/b" },
      // a variant reusing the product's photo
      { url: `${base}a.jpg`, public_id: "ohhobastra/products/a" },
      // shown on a past order
      { url: `${base}c.jpg`, public_id: "ohhobastra/products/c" },
      // the demo catalog's, on another cloud
      {
        url: "https://res.cloudinary.com/demo/image/upload/samples/d.jpg",
        public_id: "samples/d",
      },
    ];
    expect(deletableImages(cld, images, [`${base}c.jpg`])).toEqual([
      "ohhobastra/products/a",
      "ohhobastra/products/b",
    ]);
    expect(deletableImages(null, images, [])).toBeNull();
  });
});
