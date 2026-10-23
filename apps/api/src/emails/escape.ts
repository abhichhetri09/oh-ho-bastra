// The escaping Go's html/template applied to the email templates, so the
// port renders the same bytes: html() for text and quoted attributes, url()
// for an action at the start of an href/src attribute.

const HTML_REPLACEMENTS: Record<string, string> = {
  "\0": "\uFFFD",
  '"': "&#34;",
  "&": "&amp;",
  "'": "&#39;",
  "+": "&#43;",
  "<": "&lt;",
  ">": "&gt;",
};

/** html/template's htmlEscaper (also its attribute and RCDATA escaper). */
export const html = (s: string) =>
  s.replace(/[\0"&'+<>]/g, (c) => HTML_REPLACEMENTS[c]!);

/**
 * urlFilter: a URL with a scheme other than http, https or mailto (say
 * javascript:) becomes "#ZgotmplZ".
 */
function urlFilter(s: string): string {
  const colon = s.indexOf(":");
  if (colon >= 0) {
    const protocol = s.slice(0, colon);
    if (!protocol.includes("/") && !/^(https?|mailto)$/i.test(protocol))
      return "#ZgotmplZ";
  }
  return s;
}

const isHex = (b: number | undefined) =>
  b !== undefined &&
  ((b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x46) ||
    (b >= 0x61 && b <= 0x66));

/** RFC 3986 reserved characters, which urlNormalizer leaves as they are. */
const RESERVED = new Set([..."!#$&*+,/:;=?@[]"].map((c) => c.charCodeAt(0)));

/**
 * urlNormalizer: percent-encodes (lowercase hex, byte by byte) whatever
 * isn't unreserved or reserved, keeping valid escapes such as %2B.
 */
function urlNormalizer(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    const keep =
      RESERVED.has(c) ||
      c === 0x2d ||
      c === 0x2e ||
      c === 0x5f ||
      c === 0x7e || // - . _ ~
      (c >= 0x61 && c <= 0x7a) ||
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x30 && c <= 0x39) ||
      (c === 0x25 &&
        i + 2 < bytes.length &&
        isHex(bytes[i + 1]) &&
        isHex(bytes[i + 2]));
    out += keep
      ? String.fromCharCode(c)
      : "%" + c.toString(16).padStart(2, "0");
  }
  return out;
}

/** A URL at the start of a quoted href/src attribute. */
export const url = (s: string) => html(urlNormalizer(urlFilter(s)));

/** Go's url.QueryEscape: only A-Z a-z 0-9 - _ . ~ stay; a space is "+". */
export const queryEscape = (s: string) =>
  encodeURIComponent(s)
    .replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    )
    .replace(/%20/g, "+");
