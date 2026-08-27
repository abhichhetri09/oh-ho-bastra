import type { Swatch } from "@/data/products";
import { cn } from "@/lib/utils";

export function ClothPanel({
  swatch,
  className,
  label,
}: {
  swatch: Swatch;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden bg-stone-800", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(152deg, ${swatch.from} 0%, ${swatch.to} 68%, ${swatch.fold} 100%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-90 mix-blend-soft-light"
        style={{
          background: `radial-gradient(90% 70% at 22% 12%, ${swatch.sheen}, transparent 58%), linear-gradient(105deg, transparent 18%, rgba(255,255,255,0.22) 36%, transparent 48%, rgba(0,0,0,0.18) 72%)`,
        }}
      />
      <div className="cloth-weave absolute inset-0 opacity-40 mix-blend-multiply" />
      <div className="absolute inset-y-[-10%] left-[12%] w-[38%] rotate-6 bg-linear-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}
