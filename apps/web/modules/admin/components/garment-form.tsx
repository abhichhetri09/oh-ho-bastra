"use client";

import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { combinations, GarmentBodySchema, type GarmentBody } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSaveGarment } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminAttributes } from "../queries";

/**
 * Makes a garment's blanks in one go: a name, the colours and sizes it comes
 * in, a price and a starting count give one blank per combination.
 */
export function GarmentForm() {
  const lists = useAdminAttributes();
  const [garment, setGarment] = useState("");
  // attribute name → the values picked, in the list's order
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useAdminMutation({
    mutationFn: async (body: GarmentBody) => {
      const { data } = await adminSaveGarment({ body, throwOnError: true });
      return data.data;
    },
    success: (blanks, b) => `${b.garment}: ${blanks.length} blanks saved`,
    failure: "Couldn't save the garment.",
    quietOnFieldErrors: true,
    invalidate: [adminKeys.blanks()],
    onSuccess: () => {
      setGarment("");
      setPicked({});
      setPrice("");
      setStock("");
    },
  });

  if (!lists.data) {
    return lists.isError ? null : <Skeleton className="h-48" />;
  }

  const options = lists.data
    .map((a) => ({
      name: a.name,
      type: a.type,
      values: a.values
        .map((v) => v.value)
        .filter((v) => picked[a.name]?.includes(v)),
    }))
    .filter((o) => o.values.length > 0);
  const count =
    options.length === 0 ? 0 : options.reduce((n, o) => n * o.values.length, 1);
  const example = combinations(options.map((o) => o.values))[0];

  function toggle(list: string, value: string) {
    setPicked((p) => {
      const now = p[list] ?? [];
      return {
        ...p,
        [list]: now.includes(value)
          ? now.filter((v) => v !== value)
          : [...now, value],
      };
    });
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = GarmentBodySchema.safeParse({
      garment,
      options,
      price: toCents(price) ?? NaN,
      stock: stock.trim() === "" ? 0 : Number(stock),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path[0] === "garment"
          ? "Give the garment a name."
          : issue?.path[0] === "options"
            ? issue.message.startsWith("At most")
              ? issue.message
              : "Pick at least one colour or size."
            : issue?.path[0] === "price"
              ? "Give a price, like 25.00."
              : "The starting stock must be 0 to 10,000.",
      );
      return;
    }
    save.mutate(parsed.data, {
      onError: (err) => {
        const field = getApiError(err)?.errors?.[0];
        if (field) setError(field.message);
      },
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5 rounded-panel border border-border p-5"
    >
      <div>
        <h2 className="font-serif text-xl">Add a garment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the colours and sizes it comes in. One blank is made for each
          combination, ready to make a print&apos;s variants from in one click.
        </p>
      </div>

      <Input
        value={garment}
        onChange={(e) => {
          setGarment(e.target.value);
          setError(null);
        }}
        placeholder="Garment name, like Classic tee"
        aria-label="Garment name"
        maxLength={60}
        className="h-10"
      />

      {lists.data.map((list) => (
        <fieldset key={list.id} className="space-y-2">
          <legend className="eyebrow mb-2">{list.name}</legend>
          <div className="flex flex-wrap gap-1.5">
            {list.values.map((v) => {
              const on = picked[list.name]?.includes(v.value) ?? false;
              return (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(list.name, v.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[0.8125rem] transition-colors",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/40",
                  )}
                >
                  {v.hex && (
                    <span
                      aria-hidden
                      className="size-3 rounded-full ring-1 ring-foreground/20"
                      style={{ backgroundColor: v.hex }}
                    />
                  )}
                  {v.value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={price}
          inputMode="decimal"
          onChange={(e) => {
            setPrice(e.target.value.replace(/[^\d.,]/g, ""));
            setError(null);
          }}
          placeholder="Price (€)"
          aria-label="Price of a print on it"
          className="h-10 sm:w-36"
        />
        <Input
          value={stock}
          inputMode="numeric"
          onChange={(e) => {
            setStock(e.target.value.replace(/\D/g, "").slice(0, 5));
            setError(null);
          }}
          placeholder="Stock each"
          aria-label="Starting stock of each blank"
          className="h-10 sm:w-36"
        />
        <Button
          type="submit"
          className="h-10 sm:ml-auto"
          disabled={save.isPending || count === 0}
        >
          <PlusIcon data-icon="inline-start" />
          {save.isPending
            ? "Saving…"
            : count > 0
              ? `Make ${count} blank${count === 1 ? "" : "s"}`
              : "Make blanks"}
        </Button>
      </div>

      {count > 0 && example && !error && (
        <p className="text-xs text-muted-foreground">
          Named like &ldquo;
          {[garment.trim() || "Garment", ...example].join(", ")}
          &rdquo;. Blanks you already have with that name join the garment and
          keep their stock.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
