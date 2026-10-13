"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Asks before something that can't be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  pendingLabel = "Deleting…",
  tone = "destructive",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  pendingLabel?: string;
  /** destructive for deletes and refunds, default for the rest. */
  tone?: "destructive" | "default";
  onConfirm: () => void;
  /** Extra fields, between the description and the buttons. */
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="gap-6 p-6 sm:max-w-md">
        <DialogHeader className="gap-2">
          <DialogTitle className="font-serif text-2xl font-normal">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[0.8125rem] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
