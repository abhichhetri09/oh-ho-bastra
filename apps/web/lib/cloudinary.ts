// Cloudinary URL transformations. Transformations already in a URL (crops
// from the catalog) run first; a new one is inserted after them.

const UPLOAD = "/image/upload/";

// Cloudinary transformation parameter keys, used to tell a transformation
// segment ("c_fill,g_auto") from a public ID folder.
const PARAMS = new Set([
  "a",
  "ar",
  "b",
  "bo",
  "c",
  "co",
  "dpr",
  "e",
  "f",
  "fl",
  "g",
  "h",
  "l",
  "o",
  "q",
  "r",
  "t",
  "u",
  "w",
  "x",
  "y",
  "z",
]);

function isTransformation(segment: string): boolean {
  return segment.split(",").every((part) => {
    const key = part.split("_", 1)[0] ?? "";
    return part.includes("_") && PARAMS.has(key);
  });
}

/** Appends a transformation to a Cloudinary URL; other URLs pass through. */
export function withTransformation(src: string, transformation: string) {
  const at = src.indexOf(UPLOAD);
  if (!src.startsWith("https://res.cloudinary.com/") || at === -1) return src;

  const head = src.slice(0, at + UPLOAD.length);
  const segments = src.slice(at + UPLOAD.length).split("/");
  let split = 0;
  while (split < segments.length - 1 && isTransformation(segments[split]!)) {
    split++;
  }
  return (
    head +
    [
      ...segments.slice(0, split),
      transformation,
      ...segments.slice(split),
    ].join("/")
  );
}

/**
 * A JPEG cropped to exactly width × height around the subject. Share
 * images use it, since their renderer can't read WebP or AVIF.
 */
export function cloudinaryJpeg(src: string, width: number, height: number) {
  return withTransformation(
    src,
    `c_fill,g_auto,w_${width},h_${height},f_jpg,q_auto`,
  );
}
