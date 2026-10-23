import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground [--dot:var(--muted-foreground)]",
  success: "bg-success-soft text-success [--dot:var(--success)]",
  warning: "bg-warning-soft text-warning [--dot:var(--warning)]",
  info: "bg-info-soft text-info [--dot:var(--info)]",
  danger: "bg-danger-soft text-danger [--dot:var(--danger)]",
};

/** Colored status label. The text always carries the meaning; color only groups. */
export function StatusPill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-(--dot)" aria-hidden />
      {children}
    </span>
  );
}
