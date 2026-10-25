import Link from "next/link";
import {
  ArrowUpRightIcon,
  BuildingsIcon,
  MegaphoneIcon,
  PaletteIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Tile = {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: Icon;
  tone: "ok" | "muted" | "warn";
};

/** The settings page's summary row: one tile per area, linking to it. */
export function StoreStatus({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-12 grid gap-3 sm:grid-cols-3">
      {tiles.map(({ label, value, detail, href, icon: TileIcon, tone }) => (
        <Link
          key={label}
          href={href}
          className="group flex flex-col gap-4 rounded-panel border border-border bg-card p-5 transition-colors hover:border-foreground/30"
        >
          <span className="flex items-center justify-between">
            <span className="flex size-9 items-center justify-center rounded-control bg-surface">
              <TileIcon className="size-4.5" />
            </span>
            <ArrowUpRightIcon className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
          <span className="space-y-1">
            <span className="eyebrow block">{label}</span>
            <span className="flex items-center gap-2 text-[0.9375rem] font-medium">
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  tone === "ok" && "bg-success",
                  tone === "muted" && "bg-muted-foreground/50",
                  tone === "warn" && "bg-clay",
                )}
              />
              {value}
            </span>
            <span className="block text-xs text-muted-foreground">
              {detail}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export const STATUS_ICONS = {
  theme: PaletteIcon,
  banner: MegaphoneIcon,
  business: BuildingsIcon,
};
