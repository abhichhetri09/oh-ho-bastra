"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { BlankBodySchema, type AdminBlank, type BlankBody } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminCreateBlank,
  adminDeleteBlank,
  adminUpdateBlank,
} from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminBlanks } from "../queries";

/** Stock moves every variant on the blank, so all their views refetch. */
const touched = [
  adminKeys.blanks(),
  adminKeys.products(),
  adminKeys.inventory(),
  adminKeys.stats(),
  adminKeys.counts(),
];

/**
 * The blanks, with an add row on top. A name or count is saved on Enter or
 * when its field loses focus; the count is absolute, so a resend is harmless.
 */
export function BlanksManager() {
  const blanks = useAdminBlanks();
  const [deleting, setDeleting] = useState<AdminBlank | null>(null);

  const remove = useAdminMutation({
    mutationFn: async (blank: AdminBlank) => {
      await adminDeleteBlank({
        path: { blankID: blank.id },
        throwOnError: true,
      });
    },
    success: (_, b) => `${b.name} was deleted`,
    failure: "Couldn't delete the blank.",
    invalidate: touched,
    onSuccess: () => setDeleting(null),
  });

  const rows = blanks.data ?? [];

  return (
    <div className="space-y-5">
      <AddBlank />

      <div className="overflow-hidden rounded-panel border border-border">
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Blank</TableHead>
              <TableHead className="text-right">Variants</TableHead>
              <TableHead className="pr-8 text-right">Stock</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {blanks.isPending ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : blanks.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The blanks couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => blanks.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center">
                  <p className="font-serif text-2xl">No blanks yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Add one per garment, colour and size you keep, like
                    &ldquo;Plain tee, Black, M&rdquo;. Then link variants to it
                    from their product.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((blank) => (
                <BlankRow
                  key={blank.id}
                  blank={blank}
                  onDelete={() => setDeleting(blank)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this blank?"
        description={
          deleting &&
          (deleting.variant_count > 0
            ? `Its ${deleting.variant_count} ${deleting.variant_count === 1 ? "variant keeps" : "variants each keep"} the count of ${deleting.stock} as ${deleting.variant_count === 1 ? "its" : "their"} own, no longer shared.`
            : "No variants use it.")
        }
        confirmLabel="Delete blank"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function AddBlank() {
  const [name, setName] = useState("");
  const [stock, setStock] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useAdminMutation({
    mutationFn: async (body: BlankBody) => {
      await adminCreateBlank({ body, throwOnError: true });
    },
    success: (_, b) => `${b.name} added`,
    failure: "Couldn't add the blank.",
    quietOnFieldErrors: true,
    invalidate: [adminKeys.blanks()],
    onSuccess: () => {
      setName("");
      setStock("");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = BlankBodySchema.safeParse({
      name,
      stock: stock.trim() === "" ? NaN : Number(stock),
    });
    if (!parsed.success) {
      setError("Give it a name and a count up to 10,000.");
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onError: (err) => {
        const field = getApiError(err)?.errors?.[0];
        if (field) setError(field.message);
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Plain tee, Black, M"
          aria-label="New blank's name"
          maxLength={80}
          className="h-10 flex-1"
        />
        <Input
          value={stock}
          inputMode="numeric"
          onChange={(e) => {
            setStock(e.target.value.replace(/\D/g, "").slice(0, 5));
            setError(null);
          }}
          placeholder="Stock"
          aria-label="New blank's stock"
          className="h-10 sm:w-28"
        />
        <Button type="submit" className="h-10" disabled={create.isPending}>
          <PlusIcon data-icon="inline-start" />
          {create.isPending ? "Adding…" : "Add blank"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function BlankRow({
  blank,
  onDelete,
}: {
  blank: AdminBlank;
  onDelete: () => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [stock, setStock] = useState<string | null>(null);

  const save = useAdminMutation({
    mutationFn: async (body: BlankBody) => {
      await adminUpdateBlank({
        path: { blankID: blank.id },
        body,
        throwOnError: true,
      });
    },
    success: "Blank saved",
    failure: "Couldn't save the blank.",
    invalidate: touched,
    onSuccess: () => {
      setName(null);
      setStock(null);
    },
  });

  function commit() {
    if (name === null && stock === null) return;
    const parsed = BlankBodySchema.safeParse({
      name: name ?? blank.name,
      stock: stock === null ? blank.stock : Number(stock || NaN),
    });
    if (
      !parsed.success ||
      (parsed.data.name === blank.name && parsed.data.stock === blank.stock)
    ) {
      setName(null);
      setStock(null);
      return;
    }
    save.mutate(parsed.data);
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setName(null);
      setStock(null);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <input
          value={name ?? blank.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={keys}
          maxLength={80}
          disabled={save.isPending}
          aria-label={`Name of ${blank.name}`}
          className="h-8 w-full border border-transparent bg-transparent px-2 text-[0.8125rem] outline-none hover:border-input focus:border-ring focus:bg-background"
        />
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {blank.variant_count}
      </TableCell>
      <TableCell className="pr-8 text-right">
        <input
          value={stock ?? String(blank.stock)}
          inputMode="numeric"
          onChange={(e) =>
            setStock(e.target.value.replace(/\D/g, "").slice(0, 5))
          }
          onBlur={commit}
          onKeyDown={keys}
          disabled={save.isPending}
          aria-label={`Stock of ${blank.name}`}
          className={cn(
            "h-8 w-20 border border-transparent bg-transparent px-2 text-right text-[0.8125rem] tabular-nums outline-none hover:border-input focus:border-ring focus:bg-background",
            blank.stock === 0 && stock === null && "text-destructive",
          )}
        />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Delete ${blank.name}`}
        >
          <TrashIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}
