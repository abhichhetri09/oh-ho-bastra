"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  DotsThreeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { AdminVariant, OptionType } from "@repo/types";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminDeleteVariant } from "@/lib/api/client";
import { formatPrice } from "@/lib/money";
import { isLightSwatch, swatchColor } from "@/lib/swatches";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import type { StoredImage } from "../lib/upload";
import { useAdminVariants } from "../queries";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Panel } from "./panel";
import { ActiveBadge } from "./status-badge";
import { StockInput } from "./stock-input";
import { VariantDialog } from "./variant-dialog";

function variantLabel(v: AdminVariant): string {
  return v.options.map((o) => o.value).join(" / ") || "Default";
}

/** The product's variants: stock edited in place, the rest in a dialog. */
export function VariantsPanel({
  productId,
  productImages,
}: {
  productId: string;
  productImages: StoredImage[];
}) {
  const variants = useAdminVariants(productId);
  const [editing, setEditing] = useState<AdminVariant | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminVariant | null>(null);
  const list = variants.data ?? [];

  // Option names and types in use, so a new variant starts with the same.
  const options = useMemo(() => {
    const seen = new Map<string, OptionType>();
    for (const v of variants.data ?? []) {
      for (const o of v.options)
        if (!seen.has(o.name)) seen.set(o.name, o.type);
    }
    return [...seen].map(([name, type]) => ({ name, type }));
  }, [variants.data]);

  const remove = useAdminMutation({
    mutationFn: async (variant: AdminVariant) => {
      await adminDeleteVariant({
        path: { productID: productId, variantID: variant.id },
        throwOnError: true,
      });
    },
    success: "Variant deleted",
    failure: "Couldn't delete the variant.",
    invalidate: [
      adminKeys.variants(productId),
      adminKeys.products(),
      adminKeys.stats(),
      adminKeys.inventory(),
      adminKeys.counts(),
    ],
    onSuccess: () => setDeleting(null),
  });

  const noDefault =
    variants.isSuccess && list.length > 0 && !list.some((v) => v.is_default);

  return (
    <Panel
      id="variants"
      title="Variants"
      hint={variants.isSuccess ? String(list.length) : undefined}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing("new")}
          // The dialog needs the existing options (and whether there are any).
          disabled={!variants.isSuccess}
        >
          <PlusIcon data-icon="inline-start" />
          Add variant
        </Button>
      }
      className="[&>div]:p-0"
    >
      {noDefault && (
        <p className="border-b border-border bg-clay/8 px-5 py-3 text-xs text-clay">
          No variant is the default, so the store doesn&apos;t list this
          product. Edit one and switch on Default.
        </p>
      )}
      {variants.isPending ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : variants.isError ? (
        <div className="p-5 text-sm text-muted-foreground">
          The variants couldn&apos;t load.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => variants.refetch()}
          >
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-serif text-2xl">No variants yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            A variant holds the price, stock and options (such as size and
            colour). The store lists the product once it has a default one.
          </p>
          <Button className="mt-6" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add the first variant
          </Button>
        </div>
      ) : (
        <Table className="md:min-w-[44rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Variant</TableHead>
              <TableHead className="hidden md:table-cell">SKU</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="pr-8 text-right">Stock</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="w-12 pr-5">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell className="pl-5">
                  <div className="flex items-center gap-3">
                    <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-media bg-surface">
                      {variant.images[0] && (
                        <Image
                          src={variant.images[0]}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {variant.options.length === 0 ? (
                          <span className="text-[0.8125rem]">No options</span>
                        ) : (
                          variant.options.map((o) => (
                            <OptionChip
                              key={o.name}
                              name={o.name}
                              value={o.value}
                              type={o.type}
                            />
                          ))
                        )}
                      </div>
                      {variant.is_default && (
                        <span className="block font-mono text-[0.5625rem] tracking-[0.14em] text-clay uppercase">
                          Default
                        </span>
                      )}
                      {!variant.is_active && (
                        <span className="sm:hidden">
                          <ActiveBadge active={false} />
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden font-mono text-[0.625rem] text-muted-foreground md:table-cell">
                  {variant.sku ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <VariantPrice variant={variant} />
                </TableCell>
                <TableCell className="pr-8 text-right">
                  <StockInput
                    productId={productId}
                    variantId={variant.id}
                    stock={variant.stock}
                    label={variantLabel(variant)}
                  />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ActiveBadge active={variant.is_active} />
                </TableCell>
                <TableCell className="pr-5">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon-sm",
                      })}
                      aria-label={`Actions for ${variantLabel(variant)}`}
                    >
                      <DotsThreeIcon className="size-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 p-1">
                      <DropdownMenuItem onClick={() => setEditing(variant)}>
                        <PencilSimpleIcon />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleting(variant)}
                      >
                        <TrashIcon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <VariantDialog
        productId={productId}
        productImages={productImages}
        editing={editing}
        options={options}
        first={list.length === 0}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this variant?"
        description={
          <>
            <span className="text-foreground">
              {deleting && variantLabel(deleting)}
            </span>{" "}
            is removed for good and leaves any bags it is in. Orders keep their
            own copy. To stop selling it for now, switch off Active instead.
            {deleting?.is_default &&
              " It is the default variant: choose another default afterwards, or the store stops listing the product."}
          </>
        }
        confirmLabel="Delete variant"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Panel>
  );
}

function OptionChip({
  name,
  value,
  type,
}: {
  name: string;
  value: string;
  type: OptionType;
}) {
  const color = type === "color" ? swatchColor(value) : null;
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-control border border-border px-2 text-[0.6875rem]">
      {color && (
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            isLightSwatch(value) && "ring-1 ring-border",
          )}
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-muted-foreground">{name}</span>
      {value}
    </span>
  );
}

const endFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** The price, with the offer if there is one; an ended offer is shown as such. */
function VariantPrice({ variant }: { variant: AdminVariant }) {
  if (variant.offer_price === null) return formatPrice(variant.selling_price);
  const ends = variant.offer_expires_at
    ? new Date(variant.offer_expires_at)
    : null;
  if (ends && ends <= new Date()) {
    return (
      <>
        {formatPrice(variant.selling_price)}
        <span className="block text-[0.625rem] text-muted-foreground">
          Offer ended
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-clay">{formatPrice(variant.offer_price)}</span>
      <span className="block text-[0.625rem] text-muted-foreground">
        <span className="line-through">
          {formatPrice(variant.selling_price)}
        </span>
        {ends && ` · until ${endFormat.format(ends)}`}
      </span>
    </>
  );
}
