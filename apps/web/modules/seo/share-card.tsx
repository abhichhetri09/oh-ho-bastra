import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MARK_PATH, MARK_VIEWBOX } from "@/components/brand/logo-mark";
import { site } from "@/lib/site";

// The images link previews show (Open Graph / X cards), drawn by next/og.
// They always use the Editorial look, whatever the store theme: they're
// the brand's face off-site. next/og renders a subset of CSS (flexbox, no
// grid), and every element with several children needs display: flex.

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SHARE_TYPE = "image/png";

const PHOTO_WIDTH = 504; // 4:5 at the card's full height

const COLOR = {
  paper: "#faf8f4",
  ink: "#24201c",
  muted: "#6f665d",
  clay: "#a4502f",
  line: "#e4ddd2",
};

// Passing fonts replaces next/og's default (Geist), so Geist comes along
// for the small text. Both are OFL; the licences sit beside the files.
type Font = {
  name: string;
  data: Buffer;
  weight: 400;
  style: "normal";
};
let fonts: Promise<Font[]> | undefined;
function loadFonts(): Promise<Font[]> {
  // Literal paths, so Next's output tracing ships the files with the
  // server functions that read them.
  fonts ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/InstrumentSerif-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
  ]).then(
    ([serif, sans]): Font[] => [
      { name: "Instrument Serif", data: serif, weight: 400, style: "normal" },
      { name: "Geist", data: sans, weight: 400, style: "normal" },
    ],
    (error: unknown) => {
      fonts = undefined; // let the next request try again
      throw error;
    },
  );
  return fonts;
}

/** A photo as a data URL, or null when it can't be fetched in time. */
async function photo(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${data}`;
  } catch {
    return null;
  }
}

/** The logo mark (components/brand/logo-mark.tsx), for next/og. */
function Mark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX}>
      <path d={MARK_PATH} fill={color} />
    </svg>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <Mark size={size * 0.66} color={COLOR.ink} />
      <span style={{ fontFamily: "Instrument Serif", fontSize: size }}>
        {site.name}
      </span>
    </div>
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The store's own card: the mark, the name and the tagline. */
export async function brandImage(): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: COLOR.paper,
        color: COLOR.ink,
        fontFamily: "Geist",
        gap: 28,
      }}
    >
      <Wordmark size={150} />
      <span style={{ fontSize: 32, color: COLOR.muted }}>{site.tagline}</span>
    </div>,
    { ...SHARE_SIZE, fonts: await loadFonts() },
  );
}

export type ShareCard = {
  /** Small caps above the title: a category, or "Collection". */
  eyebrow?: string;
  title: string;
  /** The line under the title: a price, a piece count. */
  detail?: string;
  /** Struck through after detail: the price before an offer. */
  was?: string;
  /** Cloudinary JPEG, already cropped to 504 × 630 (cloudinaryJpeg). */
  image: string | null;
};

/**
 * A product's or a collection's card: its photo on the left, its name and
 * price on the right. Without a photo it falls back to the brand card.
 */
export async function shareImage(card: ShareCard): Promise<ImageResponse> {
  const src = card.image ? await photo(card.image) : null;
  if (!src) return brandImage();

  const title = clip(card.title, 60);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: COLOR.paper,
        color: COLOR.ink,
        fontFamily: "Geist",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
      <img
        src={src}
        alt=""
        width={PHOTO_WIDTH}
        height={SHARE_SIZE.height}
        style={{ objectFit: "cover" }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: "56px 64px",
          borderLeft: `1px solid ${COLOR.line}`,
        }}
      >
        <Wordmark size={40} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {card.eyebrow && (
            <span
              style={{
                fontSize: 19,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: COLOR.muted,
              }}
            >
              {card.eyebrow}
            </span>
          )}
          <span
            style={{
              fontFamily: "Instrument Serif",
              fontSize: title.length > 32 ? 64 : 80,
              lineHeight: 1.02,
              letterSpacing: -1,
            }}
          >
            {title}
          </span>
          {card.detail && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <span
                style={{
                  fontSize: 32,
                  color: card.was ? COLOR.clay : COLOR.ink,
                }}
              >
                {card.detail}
              </span>
              {card.was && (
                <span
                  style={{
                    fontSize: 26,
                    color: COLOR.muted,
                    textDecoration: "line-through",
                  }}
                >
                  {card.was}
                </span>
              )}
            </div>
          )}
        </div>
        <span style={{ fontSize: 20, color: COLOR.muted }}>{site.tagline}</span>
      </div>
    </div>,
    { ...SHARE_SIZE, fonts: await loadFonts() },
  );
}
