import type { Metadata } from "next";
import Image from "next/image";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { site } from "@/lib/site";

export const metadata: Metadata = { robots: { index: false } };

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-surface lg:block">
        <Image
          src={site.authImage}
          alt={site.authImageAlt}
          fill
          preload
          sizes="50vw"
          className="animate-[hero-settle_2.2s_var(--ease-out-expo)_both] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.01_60/0.55)] via-transparent to-transparent" />
        <blockquote className="absolute inset-x-0 bottom-0 p-12 text-[oklch(0.98_0.005_85)]">
          <p className="display max-w-md text-4xl">
            &ldquo;Fewer, better things, chosen with care.&rdquo;
          </p>
          <footer className="mt-4 font-mono text-[0.6875rem] tracking-[0.16em] uppercase opacity-80">
            The {site.name} promise
          </footer>
        </blockquote>
      </div>

      <div className="flex flex-col">
        <MinimalHeader className="px-6 sm:px-10" />
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          {children}
        </div>
      </div>
    </main>
  );
}
