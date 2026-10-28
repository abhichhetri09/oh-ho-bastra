import {
  Archivo,
  Fraunces,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Playfair_Display,
  Space_Grotesk,
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
// Botanical's headline face, and the headline faces a store can pick in
// Admin → Settings. Not preloaded: every page declares their @font-face
// rules, but a browser only downloads a face when text on the page uses
// it, so a store that doesn't use one never fetches it. (The settings page
// shows them all, so it does.)
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  preload: false,
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  preload: false,
});
// Variable: its headlines use 800.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  preload: false,
});

/** The font CSS variables, for the <html> class. */
export const fontVariables = cn(
  geistSans.variable,
  geistMono.variable,
  instrumentSerif.variable,
  fraunces.variable,
  spaceGrotesk.variable,
  playfair.variable,
  archivo.variable,
);
