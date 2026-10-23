"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MAX_ANNOUNCEMENT_LENGTH, MAX_ANNOUNCEMENTS } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSetAnnouncements } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { revalidateStoreSettings } from "../actions";

/**
 * The messages in the storefront's scrolling top banner, in order. Empty
 * rows are dropped on save, and saving none hides the banner.
 */
export function AnnouncementSettings({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  // Each row keeps its id when moved, so its input moves with it.
  const [rows, setRows] = useState(() => toRows(initial));

  const save = useMutation({
    mutationFn: async (announcements: string[]) => {
      const { data } = await adminSetAnnouncements({
        body: { announcements },
        throwOnError: true,
      });
      return data.data.announcements;
    },
    onSuccess: async (announcements) => {
      setSaved(announcements);
      setRows(toRows(announcements));
      toast.success(
        announcements.length
          ? "The top banner is updated"
          : "The top banner is hidden",
      );
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        getApiError(error)?.message ?? "Couldn't save the banner. Try again.",
      );
    },
  });

  const texts = rows.map((row) => row.text);
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(saved);
  const tooLong = texts.some((t) => t.trim().length > MAX_ANNOUNCEMENT_LENGTH);
  const busy = save.isPending;

  const update = (id: number, text: string) =>
    setRows((list) => list.map((row) => (row.id === id ? { id, text } : row)));
  const remove = (id: number) =>
    setRows((list) => list.filter((row) => row.id !== id));
  const move = (i: number, by: -1 | 1) =>
    setRows((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });

  return (
    <section className="mt-6 overflow-hidden rounded-panel border border-border bg-card">
      <header className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-[0.8125rem] font-medium">Announcement bar</h2>
        <p className="text-xs text-muted-foreground">
          The messages that scroll across the top of every shop page, in order.
          Remove them all to hide the bar.
        </p>
      </header>

      <div className="space-y-3 p-5">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No messages: the bar is hidden.
          </p>
        )}
        <ol className="space-y-2">
          {rows.map(({ id, text }, i) => {
            const length = text.trim().length;
            const over = length > MAX_ANNOUNCEMENT_LENGTH;
            return (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={text}
                    onChange={(e) => update(id, e.target.value)}
                    placeholder="Free shipping on orders over €60"
                    aria-label={`Message ${i + 1}`}
                    aria-invalid={over || undefined}
                    disabled={busy}
                    className="pr-14"
                  />
                  <span
                    className={`pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[0.625rem] ${over ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {length}/{MAX_ANNOUNCEMENT_LENGTH}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move message ${i + 1} up`}
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move message ${i + 1} down`}
                  disabled={busy || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove message ${i + 1}`}
                  disabled={busy}
                  onClick={() => remove(id)}
                >
                  <TrashIcon />
                </Button>
              </li>
            );
          })}
        </ol>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || rows.length >= MAX_ANNOUNCEMENTS}
          onClick={() =>
            setRows((list) => [...list, { id: nextId++, text: "" }])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Add message
        </Button>
        {rows.length >= MAX_ANNOUNCEMENTS && (
          <p className="text-xs text-muted-foreground">
            The bar holds at most {MAX_ANNOUNCEMENTS} messages.
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        {tooLong && (
          <p className="mr-auto text-xs text-destructive" role="status">
            Keep each message to {MAX_ANNOUNCEMENT_LENGTH} characters.
          </p>
        )}
        <Button
          variant="outline"
          disabled={busy || JSON.stringify(texts) === JSON.stringify(saved)}
          onClick={() => setRows(toRows(saved))}
        >
          Discard
        </Button>
        <Button
          disabled={!dirty || tooLong || busy}
          onClick={() => save.mutate(cleaned)}
        >
          {busy ? "Saving…" : "Save banner"}
        </Button>
      </footer>
    </section>
  );
}

let nextId = 0;

const toRows = (texts: string[]) =>
  texts.map((text) => ({ id: nextId++, text }));
