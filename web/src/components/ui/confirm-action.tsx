import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useDismiss } from "@/hooks/useDismiss";
import { cn } from "@/lib/utils";

/**
 * A button that opens a confirmation popover before running `onConfirm`.
 * `children` can add inputs (a reason, a tracking number) to the popover.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  tone = "default",
  onConfirm,
  pending,
  error,
  children,
  triggerVariant = "outline",
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "default" | "destructive";
  onConfirm: () => Promise<unknown> | void;
  pending?: boolean;
  error?: string | null;
  children?: ReactNode;
  triggerVariant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => !pending && setOpen(false), [pending]);
  const ref = useDismiss<HTMLDivElement>(open, close);

  return (
    <div ref={ref} className="relative">
      <Button variant={triggerVariant} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className={cn(
            // Popover under the button; on phones a bottom sheet so it never runs off-screen.
            "fixed inset-x-4 bottom-4 z-50 space-y-3 rounded-xl border bg-background p-4 text-left text-sm shadow-xl",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:z-40 sm:mt-2 sm:w-96 sm:shadow-lg",
            tone === "destructive" && "border-danger/40",
          )}
        >
          <div>
            <p className="font-medium">{title}</p>
            {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
          </div>
          {children}
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Keep as is
            </Button>
            <Button
              variant={tone === "destructive" ? "destructive" : "default"}
              disabled={pending}
              onClick={async () => {
                try {
                  await onConfirm();
                  setOpen(false);
                } catch {
                  // Stay open; the caller shows `error`.
                }
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
