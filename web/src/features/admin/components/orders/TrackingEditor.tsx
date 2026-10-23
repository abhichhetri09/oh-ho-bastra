import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetTracking } from "@/features/admin/api";
import type { AdminOrder } from "@/features/admin/types";

/** Shows the tracking number, with inline add/edit once the order has shipped. */
export function TrackingEditor({ order }: { order: AdminOrder }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.trackingNumber ?? "");
  const save = useSetTracking(order.id);
  const canEdit = order.status === "fulfilled";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(value.trim(), { onSuccess: () => setEditing(false) });
  }

  if (editing) {
    return (
      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="tracking-edit" className="text-sm font-medium">
          Tracking number
        </label>
        <Input
          id="tracking-edit"
          autoFocus
          value={value}
          placeholder="JJFI60123456789"
          onChange={(e) => setValue(e.target.value)}
        />
        {save.isError ? <p className="text-sm text-danger">{save.error.message}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(order.trackingNumber ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">Tracking</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">{order.trackingNumber ?? "—"}</span>
        {canEdit ? (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
            {order.trackingNumber ? "Edit" : "Add"}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
