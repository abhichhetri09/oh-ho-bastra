import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ArrowLeft } from "@/components/icons";

/** Page header for app screens: optional back link, title, meta line and actions. */
export function AppPage({
  title,
  description,
  back,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { to: string; label: string };
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof title === "string") document.title = `${title} · Oh Ho Bastra`;
  }, [title]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {back ? (
          <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {meta}
            </div>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
