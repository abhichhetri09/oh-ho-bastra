import {
  Fraunces,
  Geist,
  Geist_Mono,
  Instrument_Serif,
} from "next/font/google";
import { cn } from "@/lib/utils";

// The root layout and global-error (which replaces it) share these.

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
// Botanical's headline face. Not preloaded: only pages in that theme use it,
// so other themes never download it.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  preload: false,
});

/** The font CSS variables, for the <html> class. */
export const fontVariables = cn(
  geistSans.variable,
  geistMono.variable,
  instrumentSerif.variable,
  fraunces.variable,
);
