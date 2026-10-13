import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { DEFAULT_THEME, themeById } from "@/lib/themes";

export default function manifest(): MetadataRoute.Manifest {
  const color = themeById(DEFAULT_THEME).themeColor;
  return {
    name: `${site.name}: ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: color,
    theme_color: color,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
