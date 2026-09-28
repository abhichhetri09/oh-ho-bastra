import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddOrderNote } from "@/features/admin/api";
import { Panel } from "@/components/app-shell/Panel";
import { eventStyle } from "@/features/admin/status";
import type { AdminOrder } from "@/features/admin/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const dotTone = {
  neutral: "bg-secondary text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

function NoteComposer({ orderId }: { orderId: string }) {
  const [message, setMessage] = useState("");
  const addNote = useAddOrderNote(orderId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    addNote.mutate(message.trim(), { onSuccess: () => setMessage("") });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t p-4">
      <label htmlFor="note" className="sr-only">
        Add an internal note
      </label>
      <Textarea
        id="note"
        rows={2}
        placeholder="Add an internal note — customers never see these."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        {addNote.isError ? <p className="text-sm text-danger">{addNote.error.message}</p> : <span />}
        <Button type="submit" size="sm" disabled={!message.trim() || addNote.isPending}>
          {addNote.isPending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}

export function OrderTimeline({ order }: { order: AdminOrder }) {
  return (
    <Panel title="Timeline" flush footer={<NoteComposer orderId={order.id} />}>
      <ol className="space-y-0 p-4">
        {order.events.map((event, index) => {
          const style = eventStyle[event.type];
          const Icon = style.icon;
          return (
            <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < order.events.length - 1 ? (
                <span className="absolute top-8 bottom-0 left-3.5 w-px bg-border" aria-hidden />
              ) : null}
              <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", dotTone[style.tone])}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5 text-sm">
                <p>
                  <span className="font-medium">{style.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                  </span>
                </p>
                {event.message ? (
                  <p className={cn("mt-1 text-muted-foreground", event.type === "note" && "rounded-md bg-muted/60 px-3 py-2 text-foreground")}>
                    {event.message}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
