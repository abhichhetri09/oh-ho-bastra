"use client";

import { useState } from "react";
import Link from "next/link";
import type { GenerateVariantsBody } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { adminGenerateVariants } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { toCents } from "@/lib/money";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminGarments } from "../queries";

/**
 * Makes a product's variants from a garment: one per colour and size, each
 * on its blank, with the blank's price unless another is given.
 */
export function GenerateVariantsDialog({
  productId,
  open,
  onClose,
}: {
  productId: string;
  open: boolean;
  onClose: () => void;
}) {
  const garments = useAdminGarments();
  const [garment, setGarment] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const generate = useAdminMutation({
    mutationFn: async (body: GenerateVariantsBody) => {
      const { data } = await adminGenerateVariants({
        path: { productID: productId },
        body,
        throwOnError: true,
      });
      return data.data;
    },
    success: ({ created, skipped }) =>
      created === 0
        ? "The product already has all of them"
        : `${created} variant${created === 1 ? "" : "s"} added` +
          (skipped > 0 ? ` (${skipped} it had already)` : ""),
    failure: "Couldn't add the variants.",
    quietOnFieldErrors: true,
    invalidate: [
      adminKeys.variants(productId),
      adminKeys.products(),
      adminKeys.blanks(),
      adminKeys.inventory(),
      adminKeys.stats(),
      adminKeys.counts(),
    ],
    onSuccess: () => close(),
  });

  function close() {
    setGarment(null);
    setPrice("");
    setError(null);
    onClose();
  }

  const list = garments.data ?? [];
  const chosen = garment ?? list[0]?.garment ?? null;
  const items = list.map((g) => ({
    value: g.garment,
    label: `${g.garment} (${g.blank_count})`,
  }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    let selling_price: number | undefined;
    if (price.trim() !== "") {
      const cents = toCents(price);
      if (!cents || cents <= 0) {
        setError("Give a price like 25.00, or leave it empty.");
        return;
      }
      selling_price = cents;
    }
    generate.mutate(
      { garment: chosen, selling_price },
      {
        onError: (err) => {
          const field = getApiError(err)?.errors?.[0];
          if (field) setError(field.message);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !generate.isPending && close()}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add variants from a garment</DialogTitle>
            <DialogDescription>
              Adds one variant for every colour and size of the garment, each
              printed on its blank and using the product&apos;s images. Ones the
              product already has are left as they are.
            </DialogDescription>
          </DialogHeader>

          {garments.isPending ? (
            <Skeleton className="h-10" />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No garments yet. Add one under{" "}
              <Link href="/admin/blanks" className="underline">
                Catalog → Blanks
              </Link>
              .
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel className="eyebrow !text-foreground">
                  Garment
                </FieldLabel>
                <Select
                  value={chosen}
                  onValueChange={(v) => {
                    setGarment(v);
                    setError(null);
                  }}
                  items={items}
                >
                  <SelectTrigger aria-label="Garment" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="generate-price"
                  className="eyebrow !text-foreground"
                >
                  Price (optional)
                </FieldLabel>
                <Input
                  id="generate-price"
                  value={price}
                  inputMode="decimal"
                  onChange={(e) => {
                    setPrice(e.target.value.replace(/[^\d.,]/g, ""));
                    setError(null);
                  }}
                  placeholder="Each blank's own price"
                  className="h-10"
                />
              </Field>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={generate.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!chosen || generate.isPending}>
              {generate.isPending ? "Adding…" : "Add variants"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
