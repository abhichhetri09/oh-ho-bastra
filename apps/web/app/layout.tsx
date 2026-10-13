import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/lib/auth/session";
import { Providers } from "@/providers/providers";
import { currentTheme } from "@/lib/theme-server";
import { themeById, themePickerEnabled } from "@/lib/themes";
import { ThemePicker } from "@/components/theme/theme-picker";
import { fontVariables } from "@/lib/fonts";
import { indexable, siteUrl } from "@/lib/site-url";

// Pages set only their title, description and canonical. A page that set
// openGraph would replace this whole object, share image included (Next
// merges metadata one level deep); og:title and og:description fill in
// from the page's own, and the image comes from the nearest
// opengraph-image file.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${site.name}: ${site.tagline}`,
      template: `%s | ${site.name}`,
    },
    description: site.description,
    applicationName: site.name,
    openGraph: { siteName: site.name, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image" },
    // Preview deployments stay out of search results.
    ...(!indexable() && { robots: { index: false, follow: false } }),
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeById(await currentTheme()).themeColor };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, theme] = await Promise.all([getSessionUser(), currentTheme()]);
  const picker = themePickerEnabled();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={cn("h-full antialiased", fontVariables)}
    >
      {/* Children never shrink: a scroll lock (dialogs, menus) can pin the
          body to the viewport height, and shrinking would collapse the
          overflow-hidden announcement bar. */}
      <body className="flex min-h-full flex-col *:shrink-0">
        <Providers user={user}>
          {children}
          {picker && <ThemePicker initial={theme} />}
        </Providers>
      </body>
    </html>
  );
}
