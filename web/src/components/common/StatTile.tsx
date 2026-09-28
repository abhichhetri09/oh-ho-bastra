import { Link } from "react-router-dom";

import type { LucideIcon } from "@/components/icons";

export type Stat = { label: string; value: string; note?: string; icon?: LucideIcon; to?: string };

export function StatTile({ label, value, note, icon: Icon, to }: Stat) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </>
  );
  const className = "block rounded-xl border bg-card p-4";
  return to ? (
    <Link to={to} className={`${className} transition-colors hover:border-foreground/30`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatTile key={stat.label} {...stat} />
      ))}
    </section>
  );
}
